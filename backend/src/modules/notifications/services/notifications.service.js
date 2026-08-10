'use strict'

const notificationModel  = require('../models/notification.model')
const socketService       = require('./socket.service')
const emailService        = require('./email.service')
const pool               = require('../../../config/db')
const { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS } = require('../../../shared/utils/constants')
const auditService = require('../../audit/services/audit.service')

// Función principal — crea la notificación en DB y la envía por los canales configurados
const send = async ({ userId, type, title, body, entity = null, entity_id = null }) => {
  try {
    // Verificar preferencias del usuario
    const [prefRows] = await pool.execute(
      `SELECT in_app_enabled, email_enabled
       FROM notification_preferences
       WHERE user_id = ? AND notification_type = ?`,
      [userId, type]
    )

    // Por defecto in_app activo, email inactivo
    const prefs = prefRows[0] || { in_app_enabled: true, email_enabled: false }

    // Guardar en DB y emitir por socket
    if (prefs.in_app_enabled) {
      const id = await notificationModel.create({
        user_id: userId, type, title, body,
        channel: NOTIFICATION_CHANNELS.IN_APP,
        entity, entity_id
      })

      socketService.emitNotification(userId, {
        id, type, title, body, entity, entity_id,
        is_read: false,
        sent_at: new Date()
      })
    }

    // Enviar email si está habilitado
    if (prefs.email_enabled) {
      await notificationModel.create({
        user_id: userId, type, title, body,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        entity, entity_id
      })

      // Obtener email del usuario
      const [userRows] = await pool.execute(
        'SELECT email, name FROM users WHERE id = ?',
        [userId]
      )

      if (userRows[0]) {
        await emailService.sendEmail({
          to:      userRows[0].email,
          subject: title,
          html:    `<h3>${title}</h3><p>${body}</p>`,
          text:    `${title}\n\n${body}`
        })
      }
    }
  } catch (err) {
    // Las notificaciones no deben cortar el flujo principal
    const logger = require('../../../shared/utils/logger')
    logger.error(`Error enviando notificación a user ${userId}: ${err.message}`)
  }
}

// Notificaciones predefinidas para los eventos más comunes
const notifyRouteCompleted = async (userId, routeName, companyId) => {
  await send({
    userId,
    type:      NOTIFICATION_TYPES.ROUTE_COMPLETED,
    title:     'Recorrido completado',
    body:      `El recorrido "${routeName}" fue completado correctamente.`,
    entity:    'collection_route',
    entity_id: companyId
  })
}

const notifyIncident = async (municipalUserIds, incident) => {
  for (const userId of municipalUserIds) {
    await send({
      userId,
      type:      NOTIFICATION_TYPES.INCIDENT_REPORTED,
      title:     'Nuevo incidente reportado',
      body:      `Se reportó un incidente en la zona: ${incident.description}`,
      entity:    'incident',
      entity_id: incident.id
    })
  }
}

const notifyRouteDelayed = async (userId, routeName) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.ROUTE_DELAYED,
    title: 'Alerta de demora',
    body:  `El recorrido "${routeName}" superó el tiempo máximo estimado.`,
    entity: 'collection_route'
  })
}

const notifyLicenseExpiring = async (userId, conductorName, expiryDate) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.LICENSE_EXPIRING,
    title: 'Licencia por vencer',
    body:  `La licencia del conductor ${conductorName} vence el ${expiryDate}.`
  })
}

// Envía un aviso de servicio público a todos los ciudadanos de una zona
// Solo el operador municipal y admin pueden llamar a esta función
// Los ciudadanos lo reciben via Socket.IO en tiempo real
const broadcastServiceAlert = async ({ zone_id, title, body, sentByUserId }) => {
  try {
    // Guardar el aviso en DB como notificación del sistema
    // user_id = null porque es para todos los ciudadanos, no uno específico
    await pool.execute(
      `INSERT INTO notifications
        (user_id, type, title, body, channel, entity, entity_id)
       VALUES (NULL, ?, ?, ?, 'in_app', 'zone', ?)`,
      [NOTIFICATION_TYPES.SERVICE_ALERT, title, body, zone_id || null]
    )

    // Emitir en tiempo real a todos los conectados
    // Los ciudadanos se suscriben al evento 'alert:service' en el frontend
    const rooms = require('../../../socket/rooms')

    if (zone_id) {
      // Si hay zona específica, emitir solo a esa zona
      rooms.emitToAll('alert:service', {
        zone_id,
        title,
        body,
        timestamp: new Date()
      })
    } else {
      // Sin zona = alerta global para toda la ciudad
      rooms.emitToAll('alert:service', {
        zone_id:   null,
        title,
        body,
        timestamp: new Date()
      })
    }

    // Nota: acá no tenemos req.user directamente, así que pasamos el userId
await auditService.record({
  requestingUser: { id: sentByUserId, role: 'municipal', company_id: null },
  action:    auditService.ACTIONS.BROADCAST_ALERT,
  entity:    auditService.ENTITIES.NOTIFICATION,
  new_values: { title, body, zone_id }
})

    return { sent: true }
  } catch (err) {
    const logger = require('../../../shared/utils/logger')
    logger.error(`broadcastServiceAlert error: ${err.message}`)
    throw err
  }
}

module.exports = {
  send,
  notifyRouteCompleted,
  notifyIncident,
  notifyRouteDelayed,
  notifyLicenseExpiring,
  broadcastServiceAlert
}