'use strict'

const trackingModel   = require('../models/tracking.model')
const scheduleModel   = require('../../schedules/models/schedule.model')
const zoneModel       = require('../../zones/models/zone.model')
const socketService   = require('../../notifications/services/socket.service')
const notifService    = require('../../notifications/services/notifications.service')
const settingsService = require('../../settings/services/settings.service')
const { haversineDistance } = require('../../../shared/utils/geo')
const { EXECUTION_STATUS }  = require('../../../shared/utils/constants')
const { ROLES }             = require('../../../shared/utils/roles')
const pool                  = require('../../../config/db')

// Crea una ejecución diaria a partir de un cronograma
const createExecution = async (data, requestingUser) => {
  // Solo operador empresa y admin pueden asignar ejecuciones
  if (![ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY].includes(requestingUser.role)) {
    throw Object.assign(new Error('Sin permisos'), { statusCode: 403 })
  }

  // Verificar que el schedule existe
  const schedule = await scheduleModel.findById(data.schedule_id)
  if (!schedule) {
    throw Object.assign(new Error('Cronograma no encontrado'), { statusCode: 404 })
  }

  // Operador empresa solo puede crear ejecuciones de su empresa
  if (
    requestingUser.role === ROLES.OPERATOR_COMPANY &&
    schedule.company_id !== requestingUser.company_id
  ) {
    throw Object.assign(new Error('Sin acceso a este cronograma'), { statusCode: 403 })
  }

  const id = await trackingModel.createExecution({
    schedule_id:         data.schedule_id,
    collection_route_id: schedule.collection_route_id,
    company_id:          schedule.company_id,
    conductor_id:        data.conductor_id || null,
    execution_date:      data.execution_date || new Date().toISOString().split('T')[0],
    zones_total:         data.zones_total   || null
  })

  return trackingModel.findExecutionById(id)
}

// El conductor inicia su recorrido
const startExecution = async (executionId, conductorId) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  if (execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('No es su recorrido'), { statusCode: 403 })
  }
  if (execution.status !== EXECUTION_STATUS.ASSIGNED) {
    throw Object.assign(
      new Error(`No se puede iniciar una ejecución en estado ${execution.status}`),
      { statusCode: 400 }
    )
  }

  await trackingModel.updateExecutionStatus(
    executionId,
    EXECUTION_STATUS.IN_PROGRESS,
    { started_at: new Date() }
  )

  // Notificar a municipal y empresa
  socketService.emitExecutionStatus(executionId, execution.company_id, EXECUTION_STATUS.IN_PROGRESS)

  return trackingModel.findExecutionById(executionId)
}

// El conductor pausa el recorrido
const pauseExecution = async (executionId, conductorId) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution || execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }
  if (execution.status !== EXECUTION_STATUS.IN_PROGRESS) {
    throw Object.assign(new Error('Solo se puede pausar un recorrido en curso'), { statusCode: 400 })
  }

  await trackingModel.updateExecutionStatus(
    executionId,
    EXECUTION_STATUS.PAUSED,
    { paused_at: new Date() }
  )

  socketService.emitExecutionStatus(executionId, execution.company_id, EXECUTION_STATUS.PAUSED)
  return trackingModel.findExecutionById(executionId)
}

// El conductor finaliza el recorrido
const completeExecution = async (executionId, conductorId, notes = null) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution || execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }
  if (![EXECUTION_STATUS.IN_PROGRESS, EXECUTION_STATUS.PAUSED].includes(execution.status)) {
    throw Object.assign(new Error('No se puede finalizar en este estado'), { statusCode: 400 })
  }

  // Determinar si fue con o sin incidencias
  const [incidentRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM incidents
     WHERE execution_id = ? AND status = 'open'`,
    [executionId]
  )
  const hasOpenIncidents = incidentRows[0].total > 0
  const finalStatus = hasOpenIncidents
    ? EXECUTION_STATUS.WITH_ISSUES
    : EXECUTION_STATUS.COMPLETED

  await trackingModel.updateExecutionStatus(executionId, finalStatus, {
    completed_at: new Date(),
    notes:        notes || null
  })

  socketService.emitExecutionStatus(executionId, execution.company_id, finalStatus)

  // Notificar al operador empresa
  await notifService.notifyRouteCompleted(
    requestingUser?.id || conductorId,
    execution.route_name,
    execution.company_id
  )

  return trackingModel.findExecutionById(executionId)
}

// Registra un punto GPS en tiempo real
// También evalúa si el camión está cerca de alguna zona para confirmarla
const recordGpsPoint = async (data, conductorId) => {
  const { execution_id, latitude, longitude, accuracy_meters, speed_kmh, heading } = data

  const execution = await trackingModel.findExecutionById(execution_id)
  if (!execution || execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }
  if (execution.status !== EXECUTION_STATUS.IN_PROGRESS) {
    throw Object.assign(new Error('El recorrido no está en curso'), { statusCode: 400 })
  }

  // Guardar el punto GPS
  await trackingModel.saveGpsPoint({
    execution_id,
    conductor_id: conductorId,
    latitude,
    longitude,
    accuracy_meters,
    speed_kmh,
    heading,
    recorded_at:    new Date(),
    is_offline_sync: false
  })

  // Emitir posición en tiempo real
  socketService.emitGpsUpdate(execution_id, execution.company_id, {
    latitude, longitude, speed_kmh, heading,
    conductor_id: conductorId,
    timestamp:    new Date()
  })

  // Evaluar proximidad a zonas para confirmación automática
  await evaluateZoneProximity(execution_id, conductorId, latitude, longitude)

  return { saved: true }
}

// Evalúa si el camión está dentro del radio de alguna zona
// Si estuvo suficiente tiempo cerca, la confirma como visitada
const evaluateZoneProximity = async (executionId, conductorId, lat, lng) => {
  try {
    // Leer parámetros de system_settings
    const radiusMeters = await settingsService.get('gps_proximity_radius_meters') || 75
    const confirmSec   = await settingsService.get('gps_zone_confirmation_sec')    || 120
    const intervalSec  = await settingsService.get('gps_update_interval_sec')      || 60

    // Puntos necesarios dentro del radio para confirmar
    const pointsNeeded = Math.ceil(confirmSec / intervalSec)

    // Obtener zonas del recorrido
    const execution = await trackingModel.findExecutionById(executionId)
    const [zoneRows] = await pool.execute(
      `SELECT z.id, z.name, z.center_lat, z.center_lng
       FROM zones z
       INNER JOIN zone_waste_types zwt ON zwt.zone_id = z.id
       INNER JOIN collection_routes cr ON cr.waste_type_id = zwt.waste_type_id
       WHERE cr.id = ? AND z.is_active = TRUE`,
      [execution.collection_route_id]
    )

    for (const zone of zoneRows) {
      const alreadyVisited = await trackingModel.zoneAlreadyVisited(executionId, zone.id)
      if (alreadyVisited) continue

      const distanceM = haversineDistance(lat, lng, zone.center_lat, zone.center_lng)

      if (distanceM <= radiusMeters) {
        // Contar cuántos puntos recientes están dentro del radio
        const windowSec = confirmSec + intervalSec
        const [nearPoints] = await pool.execute(
          `SELECT COUNT(*) AS total
           FROM gps_tracking
           WHERE execution_id = ?
           AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
           AND (6371000 * ACOS(
             COS(RADIANS(?)) * COS(RADIANS(latitude)) *
             COS(RADIANS(longitude) - RADIANS(?)) +
             SIN(RADIANS(?)) * SIN(RADIANS(latitude))
           )) <= ?`,
          [executionId, windowSec, zone.center_lat, zone.center_lng, zone.center_lat, radiusMeters]
        )

        if (nearPoints[0].total >= pointsNeeded) {
          await trackingModel.saveZoneVisit({
            execution_id: executionId,
            zone_id:      zone.id,
            method:       'auto'
          })

          // Actualizar completion_pct
          const visits = await trackingModel.findZoneVisits(executionId)
          if (execution.zones_total) {
            const pct = Math.min((visits.length / execution.zones_total) * 100, 100).toFixed(2)
            await trackingModel.updateExecutionStatus(executionId, execution.status, {
              zones_visited:  visits.length,
              completion_pct: parseFloat(pct)
            })
          }
        }
      }
    }
  } catch (err) {
    // No interrumpir el flujo principal si falla la evaluación de zonas
    const logger = require('../../../shared/utils/logger')
    logger.error(`evaluateZoneProximity error: ${err.message}`)
  }
}

// Confirmación manual de zona por parte del conductor
const confirmZoneManually = async (executionId, zoneId, conductorId, notes = null) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution || execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }

  const alreadyVisited = await trackingModel.zoneAlreadyVisited(executionId, zoneId)
  if (alreadyVisited) {
    throw Object.assign(new Error('La zona ya fue confirmada'), { statusCode: 400 })
  }

  await trackingModel.saveZoneVisit({
    execution_id: executionId,
    zone_id:      zoneId,
    method:       'manual',
    notes
  })

  const visits = await trackingModel.findZoneVisits(executionId)
  if (execution.zones_total) {
    const pct = Math.min((visits.length / execution.zones_total) * 100, 100).toFixed(2)
    await trackingModel.updateExecutionStatus(executionId, execution.status, {
      zones_visited:  visits.length,
      completion_pct: parseFloat(pct)
    })
  }

  return trackingModel.findZoneVisits(executionId)
}

module.exports = {
  createExecution,
  startExecution,
  pauseExecution,
  completeExecution,
  recordGpsPoint,
  confirmZoneManually
}