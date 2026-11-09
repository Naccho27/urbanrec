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
// entity_id apunta a la ejecución que terminó (antes guardaba el
// company_id con entity 'collection_route', que no identificaba nada)
const notifyRouteCompleted = async (userId, routeName, executionId) => {
  await send({
    userId,
    type:      NOTIFICATION_TYPES.ROUTE_COMPLETED,
    title:     'Recorrido completado',
    body:      `El recorrido "${routeName}" fue completado correctamente.`,
    entity:    'route_execution',
    entity_id: executionId
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

// ── Alertas automáticas (las dispara alerts.service.js) ──
// Todas guardan entity = 'route_execution' (o 'user' en licencias) y el
// id correspondiente: así alerts.service puede saber si ya avisó y no
// repetir el mismo aviso cada minuto.

const notifyRouteDelayed = async (userId, { executionId, routeName, elapsedMin }) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.ROUTE_DELAYED,
    title: 'Alerta de demora',
    body:  `El recorrido "${routeName}" lleva ${formatMinutes(elapsedMin)} en curso y superó el tiempo máximo permitido.`,
    entity:    'route_execution',
    entity_id: executionId
  })
}

const notifyLicenseExpiring = async (userId, { conductorId, conductorName, expiryDate }) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.LICENSE_EXPIRING,
    title: 'Licencia por vencer',
    body:  `La licencia del conductor ${conductorName} vence el ${formatDate(expiryDate)}.`,
    entity:    'user',
    entity_id: conductorId
  })
}

const notifyRouteNotStarted = async (userId, { executionId, routeName, lateMin }) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.ROUTE_NOT_STARTED,
    title: 'Recorrido sin iniciar',
    body:  `El recorrido "${routeName}" debía comenzar hace ${formatMinutes(lateMin)} y todavía no se inició.`,
    entity:    'route_execution',
    entity_id: executionId
  })
}

const notifyGpsInactivity = async (userId, { executionId, routeName, conductorName, silentMin }) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.GPS_INACTIVITY,
    title: 'Sin señal GPS',
    body:  `El recorrido "${routeName}"${conductorName ? ` (${conductorName})` : ''} no envía su posición hace ${formatMinutes(silentMin)}. Puede ser falta de señal, batería agotada o el camión detenido.`,
    entity:    'route_execution',
    entity_id: executionId
  })
}

const notifyRouteIncomplete = async (userId, { executionId, routeName, completionPct, zonesVisited, zonesTotal }) => {
  await send({
    userId,
    type:  NOTIFICATION_TYPES.ROUTE_INCOMPLETE,
    title: 'Recorrido incompleto',
    body:  `El recorrido "${routeName}" finalizó con ${completionPct}% de cobertura (${zonesVisited} de ${zonesTotal} barrios).`,
    entity:    'route_execution',
    entity_id: executionId
  })
}

// Formatos legibles para el cuerpo de las notificaciones
const formatMinutes = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('es-AR')
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
  notifyRouteNotStarted,
  notifyGpsInactivity,
  notifyRouteIncomplete,
  broadcastServiceAlert
}