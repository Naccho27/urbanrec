'use strict'

const trackingModel = require('../models/tracking.model')
const logger        = require('../../../shared/utils/logger')

// Procesa la cola de sincronización offline del conductor.
// El conductor puede estar sin señal durante parte del recorrido.
// Cuando recupera conexión, envía todos los datos acumulados
// en un solo request con este formato:
//
// {
//   execution_id: 1,
//   gps_points: [
//     { latitude, longitude, accuracy_meters, speed_kmh, recorded_at }
//   ],
//   zone_visits: [
//     { zone_id, method, visited_at, notes }
//   ]
// }

const processSyncQueue = async (data, conductorId) => {
  const { execution_id, gps_points = [], zone_visits = [] } = data

  const results = {
    gps_saved:         0,
    zones_confirmed:   0,
    errors:            []
  }

  // Verificar que la ejecución existe y pertenece al conductor
  const execution = await trackingModel.findExecutionById(execution_id)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  if (execution.conductor_id !== conductorId) {
    throw Object.assign(new Error('No tiene acceso a esta ejecución'), { statusCode: 403 })
  }

  // Guardar puntos GPS en batch
  if (gps_points.length > 0) {
    try {
      const points = gps_points.map(p => ({
        ...p,
        execution_id,
        conductor_id: conductorId
      }))

      // Ordenar por timestamp antes de guardar
      points.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))

      results.gps_saved = await trackingModel.saveGpsPointsBatch(points)
    } catch (err) {
      results.errors.push(`Error guardando GPS: ${err.message}`)
      logger.error(`SyncQueue GPS error: ${err.message}`)
    }
  }

  // Procesar visitas a zonas
  if (zone_visits.length > 0) {
    for (const visit of zone_visits) {
      try {
        // Evitar duplicados
        const alreadyVisited = await trackingModel.zoneAlreadyVisited(
          execution_id,
          visit.zone_id
        )
        if (!alreadyVisited) {
          await trackingModel.saveZoneVisit({
            execution_id,
            zone_id: visit.zone_id,
            method:  visit.method || 'auto',
            notes:   visit.notes  || null
          })
          results.zones_confirmed++
        }
      } catch (err) {
        results.errors.push(`Error en zona ${visit.zone_id}: ${err.message}`)
        logger.error(`SyncQueue zone error: ${err.message}`)
      }
    }

    // Recalcular completion_pct si se confirmaron zonas
    if (results.zones_confirmed > 0 && execution.zones_total) {
      const visits      = await trackingModel.findZoneVisits(execution_id)
      const pct         = Math.min(
        (visits.length / execution.zones_total) * 100,
        100
      ).toFixed(2)

      await trackingModel.updateExecutionStatus(execution_id, execution.status, {
        zones_visited:  visits.length,
        completion_pct: parseFloat(pct)
      })
    }
  }

  return results
}

module.exports = { processSyncQueue }