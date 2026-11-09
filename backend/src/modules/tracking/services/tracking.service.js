'use strict'

const trackingModel   = require('../models/tracking.model')
const routeModel      = require('../../collection-routes/models/collection-route.model')
const scheduleModel   = require('../../schedules/models/schedule.model')
const zoneModel       = require('../../zones/models/zone.model')
const socketService   = require('../../notifications/services/socket.service')
const notifService    = require('../../notifications/services/notifications.service')
const settingsService = require('../../settings/services/settings.service')
const { haversineDistance } = require('../../../shared/utils/geo')
const { EXECUTION_STATUS }  = require('../../../shared/utils/constants')
const { ROLES }             = require('../../../shared/utils/roles')
const pool                  = require('../../../config/db')

// ── Creación de ejecuciones ───────────────────────────────

// Crea una ejecución diaria a partir de un cronograma
const createExecution = async (data, requestingUser) => {
  // Solo operador empresa, municipal y admin pueden asignar ejecuciones
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

  // El total de zonas se calcula del recorrido, no se recibe del cliente.
  // Antes venía en el body y un valor incorrecto rompía el cálculo de
  // completitud (zones_visited / zones_total). Ahora es la cantidad real
  // de zonas que cubre el recorrido según route_zones.
  const routeZones = await routeModel.getZones(schedule.collection_route_id)

  const id = await trackingModel.createExecution({
    schedule_id:         data.schedule_id,
    collection_route_id: schedule.collection_route_id,
    company_id:          schedule.company_id,
    conductor_id:        data.conductor_id || null,
    execution_date:      data.execution_date || new Date().toISOString().split('T')[0],
    zones_total:         routeZones.length
  })

  return trackingModel.findExecutionById(id)
}

// ── Control de acceso a ejecuciones ───────────────────────

// Verifica que el usuario tenga acceso a una ejecución concreta.
// Admin y municipal tienen acceso global.
// El operador empresa solo accede a ejecuciones de su propia empresa.
// El conductor solo accede a las ejecuciones que tiene asignadas.
//
// Sin esta verificación, cualquier operador podía pedir una ejecución
// por ID y recibir datos de otra empresa prestadora (IDOR).
const assertExecutionAccess = (execution, requestingUser) => {
  if ([ROLES.ADMIN, ROLES.MUNICIPAL].includes(requestingUser.role)) return

  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    if (execution.company_id !== requestingUser.company_id) {
      throw Object.assign(
        new Error('No tiene acceso a esta ejecución'),
        { statusCode: 403 }
      )
    }
    return
  }

  if (requestingUser.role === ROLES.CONDUCTOR) {
    if (execution.conductor_id !== requestingUser.id) {
      throw Object.assign(
        new Error('No tiene acceso a esta ejecución'),
        { statusCode: 403 }
      )
    }
    return
  }

  throw Object.assign(new Error('Sin permisos'), { statusCode: 403 })
}

// ── Lecturas con control de acceso ────────────────────────

// Listado de ejecuciones con el filtro de empresa forzado por rol.
// El company_id del query param se ignora para operador empresa y
// conductor: el filtro lo impone el servidor, no el cliente.
const getExecutions = async (filters, requestingUser) => {
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    filters.company_id = requestingUser.company_id
  }
  if (requestingUser.role === ROLES.CONDUCTOR) {
    filters.company_id   = requestingUser.company_id
    filters.conductor_id = requestingUser.id
  }
  return trackingModel.findExecutions(filters)
}

// Detalle de una ejecución, validando acceso por rol
const getExecutionById = async (id, requestingUser) => {
  const execution = await trackingModel.findExecutionById(id)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return execution
}

// Historial GPS de una ejecución, validando acceso por rol
const getGpsHistory = async (executionId, requestingUser) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return trackingModel.getGpsHistory(executionId)
}

// Zonas visitadas en una ejecución, validando acceso por rol
const getZoneVisits = async (executionId, requestingUser) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return trackingModel.findZoneVisits(executionId)
}

// ── Ciclo de vida del recorrido ───────────────────────────

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

  // Notificar a municipal y empresa en tiempo real
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

  // Determinar si cierra con o sin incidencias
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

  await notifService.notifyRouteCompleted(
    conductorId,
    execution.route_name,
    executionId
  )

  return trackingModel.findExecutionById(executionId)
}

// ── GPS y confirmación de zonas ───────────────────────────

// Registra un punto GPS en tiempo real.
// También evalúa si el camión está cerca de alguna zona del recorrido.
const recordGpsPoint = async (data, conductorId) => {
  const { execution_id, latitude, longitude, accuracy_meters, speed_kmh, heading } = data

  const execution = await trackingModel.findExecutionById(execution_id)
  if (!execution || execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }
  if (execution.status !== EXECUTION_STATUS.IN_PROGRESS) {
    throw Object.assign(new Error('El recorrido no está en curso'), { statusCode: 400 })
  }

  await trackingModel.saveGpsPoint({
    execution_id,
    conductor_id: conductorId,
    latitude,
    longitude,
    accuracy_meters,
    speed_kmh,
    heading,
    recorded_at:     new Date(),
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

// Evalúa si el camión está dentro del radio de alguna zona del recorrido.
// Si estuvo suficiente tiempo cerca, la confirma como visitada.
const evaluateZoneProximity = async (executionId, conductorId, lat, lng) => {
  try {
    // Parámetros configurables desde system_settings
    const radiusMeters = await settingsService.get('gps_proximity_radius_meters') || 75
    const confirmSec   = await settingsService.get('gps_zone_confirmation_sec')    || 120
    const intervalSec  = await settingsService.get('gps_update_interval_sec')      || 60

    // Puntos necesarios dentro del radio para confirmar la visita
    const pointsNeeded = Math.ceil(confirmSec / intervalSec)

    const execution = await trackingModel.findExecutionById(executionId)

    // Zonas que cubre este recorrido, en orden de visita.
    // La versión anterior unía por waste_type_id, lo que devolvía todas
    // las zonas que compartían tipo de residuo: con los 38 barrios
    // cargados, eso significaba evaluar la ciudad entera en cada punto GPS
    // y permitía confirmar zonas que el recorrido ni siquiera cubre.
    const zoneRows = await routeModel.getZones(execution.collection_route_id)

    for (const zone of zoneRows) {
      const alreadyVisited = await trackingModel.zoneAlreadyVisited(executionId, zone.id)
      if (alreadyVisited) continue

      const distanceM = haversineDistance(lat, lng, zone.center_lat, zone.center_lng)

      if (distanceM <= radiusMeters) {
        // Contar cuántos puntos recientes están dentro del radio.
        // LEAST/GREATEST protegen el argumento de ACOS: por redondeo de
        // punto flotante puede superar 1 y devolver NULL.
        const windowSec = confirmSec + intervalSec
        const [nearPoints] = await pool.execute(
          `SELECT COUNT(*) AS total
           FROM gps_tracking
           WHERE execution_id = ?
           AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
           AND (6371000 * ACOS(
             LEAST(1, GREATEST(-1,
               COS(RADIANS(?)) * COS(RADIANS(latitude)) *
               COS(RADIANS(longitude) - RADIANS(?)) +
               SIN(RADIANS(?)) * SIN(RADIANS(latitude))
             ))
           )) <= ?`,
          [executionId, windowSec, zone.center_lat, zone.center_lng, zone.center_lat, radiusMeters]
        )

        if (nearPoints[0].total >= pointsNeeded) {
          await trackingModel.saveZoneVisit({
            execution_id: executionId,
            zone_id:      zone.id,
            method:       'auto'
          })

          // Recalcular el porcentaje de completitud
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
    // La evaluación de zonas no debe cortar el registro del punto GPS
    const logger = require('../../../shared/utils/logger')
    logger.error(`evaluateZoneProximity error: ${err.message}`)
  }
}

// Confirmación manual de zona por parte del conductor,
// para cuando el GPS no la detectó automáticamente
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
  getExecutions,
  getExecutionById,
  getGpsHistory,
  getZoneVisits,
  startExecution,
  pauseExecution,
  completeExecution,
  recordGpsPoint,
  confirmZoneManually
}