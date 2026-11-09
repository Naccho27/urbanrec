'use strict'

const axios  = require('axios')
const pool   = require('../../../config/db')
const logger = require('../../../shared/utils/logger')
const { ai } = require('../../../config/env')

// Cliente HTTP hacia el microservicio Python (FastAPI)
const aiClient = axios.create({
  baseURL: ai.serviceUrl,
  timeout: 30000,   // 30 segundos — OR-Tools puede tardar
  headers: { 'Content-Type': 'application/json' }
})

// ── Optimización de rutas (OR-Tools VRP) ─────────────────
// Recibe los recorridos actuales y devuelve sugerencias
// de rutas más eficientes
const optimizeRoute = async (collection_route_id, requestingUserId) => {
  // Obtener datos del recorrido y sus zonas
  const [routeRows] = await pool.execute(
    `SELECT
      cr.id, cr.name, cr.geojson, cr.distance_km, cr.duration_min,
      cr.waste_type_id,
      COUNT(rz.zone_id) AS zones_count,
      AVG(z.center_lat) AS avg_lat,
      AVG(z.center_lng) AS avg_lng
     FROM collection_routes cr
     LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
     LEFT JOIN zones z        ON z.id = rz.zone_id
     WHERE cr.id = ? AND cr.is_active = TRUE
     GROUP BY cr.id`,
    [collection_route_id]
  )

  if (!routeRows[0]) {
    const err = new Error('Recorrido no encontrado')
    err.statusCode = 404
    throw err
  }

  const route = routeRows[0]

  // Obtener historial de ejecuciones para contexto
  const [execRows] = await pool.execute(
    `SELECT
      AVG(completion_pct)     AS avg_completion,
      AVG(TIMESTAMPDIFF(MINUTE, started_at, completed_at)) AS avg_duration,
      AVG(distance_covered_km) AS avg_distance,
      COUNT(*) AS total_executions
     FROM route_executions
     WHERE collection_route_id = ?
     AND status IN ('completed', 'with_issues')`,
    [collection_route_id]
  )

    const input_data = {
    route: {
      id:           route.id,
      name:         route.name,
      geojson:      route.geojson,
      distance_km:  route.distance_km,
      duration_min: route.duration_min
    },
    zone: {
      name:       `${route.zones_count} zonas`,
      center_lat: parseFloat(route.avg_lat),
      center_lng: parseFloat(route.avg_lng),
      geojson:    null
    },
    historical: execRows[0]
  }

  // Llamar al microservicio Python
  let output_data
  try {
    const response = await aiClient.post('/optimize', input_data)
    output_data = response.data
  } catch (err) {
    logger.error(`AI optimize error: ${err.message}`)
    const aiErr = new Error('El servicio de IA no está disponible. Intente más tarde.')
    aiErr.statusCode = 503
    throw aiErr
  }

  // Guardar la sugerencia en la DB
  const [result] = await pool.execute(
    `INSERT INTO ai_suggestions
      (type, collection_route_id, input_data, output_data, summary,
       estimated_savings_km, estimated_savings_min)
     VALUES ('route_optimization', ?, ?, ?, ?, ?, ?)`,
    [
      collection_route_id,
      JSON.stringify(input_data),
      JSON.stringify(output_data),
      output_data.summary || 'Análisis de optimización de ruta completado',
      output_data.estimated_savings_km  || null,
      output_data.estimated_savings_min || null
    ]
  )

  return getSuggestionById(result.insertId)
}

// ── Predicción de demanda (scikit-learn) ──────────────────
// Analiza patrones históricos por zona y predice variaciones
const predictDemand = async (zone_id, requestingUserId) => {
  // Obtener datos históricos de la zona
  const [zoneRows] = await pool.execute(
    'SELECT id, name, center_lat, center_lng FROM zones WHERE id = ? AND is_active = TRUE',
    [zone_id]
  )

  if (!zoneRows[0]) {
    const err = new Error('Zona no encontrada')
    err.statusCode = 404
    throw err
  }

  // Historial de ejecuciones por día de la semana
  // Se mide sobre ESTE barrio, no sobre el recorrido completo:
  //   - avg_completion: % de salidas en las que el barrio se recolectó
  //     (zone_visits). Un recorrido puede terminar al 92% y que justo
  //     este barrio sea el que quedó sin recolectar.
  //   - incidents: solo los incidentes ocurridos en este barrio.
  // Visitas e incidentes se calculan en subconsultas: si se unieran con
  // LEFT JOIN, cada ejecución se repetiría una vez por incidente e
  // inflaría los conteos y promedios.
  // El cronograma se une por re.schedule_id (el que se ejecutó), no por
  // recorrido: si un recorrido tuviera dos cronogramas, se duplicaría.
  // avg_duration_min: duración real; es la mejor señal del volumen de
  // residuos. predict.py la compara con la duración típica del barrio
  // para calcular el índice de carga de cada día y turno.
  const [histRows] = await pool.execute(
    `SELECT
      DAYOFWEEK(re.execution_date)  AS day_of_week,
      s.shift,
      AVG(CASE WHEN zv.execution_id IS NULL THEN 0 ELSE 100 END) AS avg_completion,
      COUNT(*)                      AS executions,
      COALESCE(SUM(inc.total), 0)   AS incidents,
      AVG(TIMESTAMPDIFF(MINUTE, re.started_at, re.completed_at)) AS avg_duration_min
     FROM route_executions re
     INNER JOIN route_zones rz      ON rz.collection_route_id = re.collection_route_id
                                   AND rz.zone_id = ?
     INNER JOIN schedules s         ON s.id = re.schedule_id
     LEFT JOIN (SELECT DISTINCT execution_id FROM zone_visits WHERE zone_id = ?) zv
                                    ON zv.execution_id = re.id
     LEFT JOIN (SELECT execution_id, COUNT(*) AS total FROM incidents
                WHERE zone_id = ? GROUP BY execution_id) inc
                                    ON inc.execution_id = re.id
     WHERE re.execution_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
     AND re.status IN ('completed', 'with_issues', 'cancelled')
     GROUP BY DAYOFWEEK(re.execution_date), s.shift
     ORDER BY day_of_week ASC`,
    [zone_id, zone_id, zone_id]
  )
  const input_data = {
    zone: zoneRows[0],
    historical_by_day: histRows,
    period_days: 90
  }

  let output_data
  try {
    const response = await aiClient.post('/predict', input_data)
    output_data = response.data
  } catch (err) {
    logger.error(`AI predict error: ${err.message}`)
    const aiErr = new Error('El servicio de IA no está disponible. Intente más tarde.')
    aiErr.statusCode = 503
    throw aiErr
  }

  const [result] = await pool.execute(
    `INSERT INTO ai_suggestions
      (type, zone_id, input_data, output_data, summary)
     VALUES ('demand_prediction', ?, ?, ?, ?)`,
    [
      zone_id,
      JSON.stringify(input_data),
      JSON.stringify(output_data),
      output_data.summary || 'Análisis de predicción de demanda completado'
    ]
  )

  return getSuggestionById(result.insertId)
}

// ── Gestión de sugerencias ────────────────────────────────

const getSuggestions = async ({ type, status, collection_route_id, zone_id } = {}) => {
  let query = `
    SELECT
      s.id, s.type, s.collection_route_id, s.zone_id,
      s.summary, s.status, s.estimated_savings_km,
      s.estimated_savings_min, s.reviewed_by,
      s.reviewed_at, s.review_notes, s.generated_at,
      cr.name AS route_name,
      z.name  AS zone_name,
      u.name  AS reviewed_by_name
    FROM ai_suggestions s
    LEFT JOIN collection_routes cr ON cr.id = s.collection_route_id
    LEFT JOIN zones z              ON z.id  = s.zone_id
    LEFT JOIN users u              ON u.id  = s.reviewed_by
    WHERE 1=1
  `
  const params = []

  if (type)                { query += ' AND s.type = ?';                   params.push(type) }
  if (status)              { query += ' AND s.status = ?';                 params.push(status) }
  if (collection_route_id) { query += ' AND s.collection_route_id = ?';   params.push(collection_route_id) }
  if (zone_id)             { query += ' AND s.zone_id = ?';               params.push(zone_id) }

  query += ' ORDER BY s.generated_at DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

const getSuggestionById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      s.id, s.type, s.collection_route_id, s.zone_id,
      s.input_data, s.output_data, s.summary, s.status,
      s.estimated_savings_km, s.estimated_savings_min,
      s.reviewed_by, s.reviewed_at, s.review_notes, s.generated_at,
      cr.name AS route_name,
      z.name  AS zone_name,
      u.name  AS reviewed_by_name
    FROM ai_suggestions s
    LEFT JOIN collection_routes cr ON cr.id = s.collection_route_id
    LEFT JOIN zones z              ON z.id  = s.zone_id
    LEFT JOIN users u              ON u.id  = s.reviewed_by
    WHERE s.id = ? LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

// El operador municipal aprueba o rechaza una sugerencia
const reviewSuggestion = async (id, { status, review_notes }, requestingUser) => {
  const suggestion = await getSuggestionById(id)
  if (!suggestion) {
    const err = new Error('Sugerencia no encontrada')
    err.statusCode = 404
    throw err
  }
  if (suggestion.status !== 'pending') {
    const err = new Error('Esta sugerencia ya fue revisada')
    err.statusCode = 400
    throw err
  }
  if (!['approved', 'rejected'].includes(status)) {
    const err = new Error('Estado inválido. Debe ser approved o rejected')
    err.statusCode = 400
    throw err
  }

  await pool.execute(
    `UPDATE ai_suggestions
     SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
     WHERE id = ?`,
    [status, requestingUser.id, review_notes || null, id]
  )

  // Registrar en auditoría
  const auditService = require('../../audit/services/audit.service')
  await auditService.record({
    requestingUser,
    action:     status === 'approved'
      ? auditService.ACTIONS.APPROVE_AI
      : auditService.ACTIONS.REJECT_AI,
    entity:     auditService.ENTITIES.AI_SUGGESTION,
    entity_id:  parseInt(id),
    old_values: { status: 'pending' },
    new_values: { status, review_notes }
  })

  return getSuggestionById(id)
}

module.exports = {
  optimizeRoute,
  predictDemand,
  getSuggestions,
  getSuggestionById,
  reviewSuggestion
}