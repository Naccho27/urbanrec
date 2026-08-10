'use strict'

const pool = require('../../../config/db')

// ── Route Executions ─────────────────────────────────────

const findExecutionById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      re.id,
      re.schedule_id,
      re.collection_route_id,
      re.company_id,
      re.conductor_id,
      re.execution_date,
      re.status,
      re.started_at,
      re.paused_at,
      re.completed_at,
      re.completion_pct,
      re.zones_total,
      re.zones_visited,
      re.distance_covered_km,
      re.notes,
      re.created_at,
      re.updated_at,
      cr.name AS route_name,
      c.name  AS company_name,
      u.name  AS conductor_name
    FROM route_executions re
    LEFT JOIN collection_routes cr ON cr.id = re.collection_route_id
    LEFT JOIN companies c          ON c.id  = re.company_id
    LEFT JOIN users u              ON u.id  = re.conductor_id
    WHERE re.id = ?
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

const findExecutions = async ({ company_id, conductor_id, status, date } = {}) => {
  let query = `
    SELECT
      re.id,
      re.collection_route_id,
      re.company_id,
      re.conductor_id,
      re.execution_date,
      re.status,
      re.started_at,
      re.completed_at,
      re.completion_pct,
      re.zones_total,
      re.zones_visited,
      cr.name AS route_name,
      c.name  AS company_name,
      u.name  AS conductor_name
    FROM route_executions re
    LEFT JOIN collection_routes cr ON cr.id = re.collection_route_id
    LEFT JOIN companies c          ON c.id  = re.company_id
    LEFT JOIN users u              ON u.id  = re.conductor_id
    WHERE 1=1
  `
  const params = []

  if (company_id) {
    query += ' AND re.company_id = ?'
    params.push(company_id)
  }
  if (conductor_id) {
    query += ' AND re.conductor_id = ?'
    params.push(conductor_id)
  }
  if (status) {
    query += ' AND re.status = ?'
    params.push(status)
  }
  if (date) {
    query += ' AND re.execution_date = ?'
    params.push(date)
  }

  query += ' ORDER BY re.execution_date DESC, re.created_at DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// Ejecuciones activas en este momento — para el mapa en tiempo real
const findActiveExecutions = async (company_id = null) => {
  let query = `
    SELECT
      re.id,
      re.collection_route_id,
      re.company_id,
      re.conductor_id,
      re.status,
      re.started_at,
      re.completion_pct,
      cr.name   AS route_name,
      cr.geojson AS route_geojson,
      c.name    AS company_name,
      u.name    AS conductor_name
    FROM route_executions re
    LEFT JOIN collection_routes cr ON cr.id = re.collection_route_id
    LEFT JOIN companies c          ON c.id  = re.company_id
    LEFT JOIN users u              ON u.id  = re.conductor_id
    WHERE re.status IN ('assigned', 'in_progress', 'paused')
    AND re.execution_date = CURDATE()
  `
  const params = []

  if (company_id) {
    query += ' AND re.company_id = ?'
    params.push(company_id)
  }

  const [rows] = await pool.execute(query, params)
  return rows
}

const createExecution = async ({
  schedule_id, collection_route_id, company_id,
  conductor_id, execution_date, zones_total
}) => {
  const [result] = await pool.execute(
    `INSERT INTO route_executions
      (schedule_id, collection_route_id, company_id,
       conductor_id, execution_date, status, zones_total)
     VALUES (?, ?, ?, ?, ?, 'assigned', ?)`,
    [
      schedule_id,
      collection_route_id,
      company_id,
      conductor_id    || null,
      execution_date,
      zones_total     || null
    ]
  )
  return result.insertId
}

const updateExecutionStatus = async (id, status, extraFields = {}) => {
  const allowed = ['started_at', 'paused_at', 'completed_at',
                   'completion_pct', 'zones_visited', 'distance_covered_km', 'notes']
  const updates = ['status = ?']
  const params  = [status]

  for (const [key, value] of Object.entries(extraFields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
      params.push(value)
    }
  }

  params.push(id)
  await pool.execute(
    `UPDATE route_executions SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
}

// ── GPS Tracking ─────────────────────────────────────────

// Guarda un punto GPS individual
const saveGpsPoint = async ({
  execution_id, conductor_id, latitude, longitude,
  accuracy_meters, speed_kmh, heading, recorded_at, is_offline_sync
}) => {
  const [result] = await pool.execute(
    `INSERT INTO gps_tracking
      (execution_id, conductor_id, latitude, longitude,
       accuracy_meters, speed_kmh, heading, recorded_at, is_offline_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      execution_id,
      conductor_id,
      latitude,
      longitude,
      accuracy_meters || null,
      speed_kmh       || null,
      heading         || null,
      recorded_at     || new Date(),
      is_offline_sync || false
    ]
  )
  return result.insertId
}

// Guarda múltiples puntos GPS de una vez — para sync offline
const saveGpsPointsBatch = async (points) => {
  if (!points || points.length === 0) return 0

  const values = points.map(p => [
    p.execution_id,
    p.conductor_id,
    p.latitude,
    p.longitude,
    p.accuracy_meters || null,
    p.speed_kmh       || null,
    p.heading         || null,
    p.recorded_at     || new Date(),
    true  // is_offline_sync siempre true en batch
  ])

  const [result] = await pool.query(
    `INSERT INTO gps_tracking
      (execution_id, conductor_id, latitude, longitude,
       accuracy_meters, speed_kmh, heading, recorded_at, is_offline_sync)
     VALUES ?`,
    [values]
  )
  return result.affectedRows
}

// Último punto GPS conocido de una ejecución
const getLastGpsPoint = async (executionId) => {
  const [rows] = await pool.execute(
    `SELECT latitude, longitude, speed_kmh, recorded_at
     FROM gps_tracking
     WHERE execution_id = ?
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [executionId]
  )
  return rows[0] || null
}

// Historial GPS completo de una ejecución — para dibujar el trazado real
const getGpsHistory = async (executionId) => {
  const [rows] = await pool.execute(
    `SELECT latitude, longitude, speed_kmh, heading, recorded_at, is_offline_sync
     FROM gps_tracking
     WHERE execution_id = ?
     ORDER BY recorded_at ASC`,
    [executionId]
  )
  return rows
}

// ── Zone Visits ───────────────────────────────────────────

const findZoneVisits = async (executionId) => {
  const [rows] = await pool.execute(
    `SELECT
      zv.id,
      zv.zone_id,
      zv.method,
      zv.visited_at,
      zv.notes,
      z.name       AS zone_name,
      z.center_lat,
      z.center_lng
    FROM zone_visits zv
    LEFT JOIN zones z ON z.id = zv.zone_id
    WHERE zv.execution_id = ?
    ORDER BY zv.visited_at ASC`,
    [executionId]
  )
  return rows
}

// Verifica si una zona ya fue visitada en esta ejecución
const zoneAlreadyVisited = async (executionId, zoneId) => {
  const [rows] = await pool.execute(
    'SELECT id FROM zone_visits WHERE execution_id = ? AND zone_id = ? LIMIT 1',
    [executionId, zoneId]
  )
  return rows.length > 0
}

const saveZoneVisit = async ({ execution_id, zone_id, method, notes }) => {
  const [result] = await pool.execute(
    `INSERT INTO zone_visits (execution_id, zone_id, method, visited_at, notes)
     VALUES (?, ?, ?, NOW(), ?)`,
    [execution_id, zone_id, method || 'auto', notes || null]
  )
  return result.insertId
}

module.exports = {
  findExecutionById,
  findExecutions,
  findActiveExecutions,
  createExecution,
  updateExecutionStatus,
  saveGpsPoint,
  saveGpsPointsBatch,
  getLastGpsPoint,
  getGpsHistory,
  findZoneVisits,
  zoneAlreadyVisited,
  saveZoneVisit
}