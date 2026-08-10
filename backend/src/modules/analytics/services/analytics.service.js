'use strict'

const pool   = require('../../../config/db')
const dayjs  = require('dayjs')
const _      = require('lodash')
const { ROLES } = require('../../../shared/utils/roles')

// Helper para aplicar filtro de empresa según el rol
const companyFilter = (requestingUser) => {
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    return requestingUser.company_id
  }
  return null  // admin y municipal ven todo
}

// ── Resumen general de ejecuciones ───────────────────────
// Completitud, estados, duración promedio por período
const getExecutionsSummary = async ({ from, to, company_id }, requestingUser) => {
  const effectiveCompany = companyFilter(requestingUser) || company_id

  let query = `
    SELECT
      re.status,
      COUNT(*)                                          AS total,
      AVG(re.completion_pct)                            AS avg_completion_pct,
      AVG(TIMESTAMPDIFF(MINUTE, re.started_at, re.completed_at))
                                                        AS avg_duration_min,
      SUM(re.distance_covered_km)                       AS total_distance_km,
      COUNT(CASE WHEN re.completion_pct = 100 THEN 1 END) AS fully_completed
    FROM route_executions re
    WHERE 1=1
  `
  const params = []

  if (from) { query += ' AND re.execution_date >= ?'; params.push(from) }
  if (to)   { query += ' AND re.execution_date <= ?'; params.push(to)   }
  if (effectiveCompany) {
    query += ' AND re.company_id = ?'
    params.push(effectiveCompany)
  }

  query += ' GROUP BY re.status ORDER BY total DESC'

  const [rows] = await pool.execute(query, params)

  return {
    by_status:   rows,
    total:       rows.reduce((sum, r) => sum + parseInt(r.total), 0),
    avg_completion: rows.length
      ? _.meanBy(rows, r => parseFloat(r.avg_completion_pct)).toFixed(2)
      : 0
  }
}

// ── Métricas por recorrido ────────────────────────────────
// Cuántas veces se ejecutó cada recorrido y con qué resultado
const getRouteMetrics = async ({ from, to, company_id }, requestingUser) => {
  const effectiveCompany = companyFilter(requestingUser) || company_id

  let query = `
    SELECT
      cr.id                     AS route_id,
      cr.name                   AS route_name,
      z.name                    AS zone_name,
      wt.name                   AS waste_type_name,
      COUNT(re.id)              AS total_executions,
      AVG(re.completion_pct)    AS avg_completion_pct,
      SUM(CASE WHEN re.status = 'completed' THEN 1 ELSE 0 END)    AS completed,
      SUM(CASE WHEN re.status = 'with_issues' THEN 1 ELSE 0 END)  AS with_issues,
      SUM(CASE WHEN re.status = 'cancelled' THEN 1 ELSE 0 END)    AS cancelled,
      AVG(TIMESTAMPDIFF(MINUTE, re.started_at, re.completed_at))  AS avg_duration_min,
      cr.duration_min           AS estimated_duration_min
    FROM collection_routes cr
    LEFT JOIN route_executions re ON re.collection_route_id = cr.id
    LEFT JOIN zones z             ON z.id = cr.zone_id
    LEFT JOIN waste_types wt      ON wt.id = cr.waste_type_id
    WHERE 1=1
  `
  const params = []

  if (from) { query += ' AND (re.execution_date >= ? OR re.id IS NULL)'; params.push(from) }
  if (to)   { query += ' AND (re.execution_date <= ? OR re.id IS NULL)'; params.push(to)   }
  if (effectiveCompany) {
    query += ' AND (re.company_id = ? OR re.id IS NULL)'
    params.push(effectiveCompany)
  }

  query += ' GROUP BY cr.id ORDER BY total_executions DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// ── Incidentes por tipo y zona ────────────────────────────
const getIncidentStats = async ({ from, to, company_id }, requestingUser) => {
  const effectiveCompany = companyFilter(requestingUser) || company_id

  let query = `
    SELECT
      i.type,
      COUNT(*)          AS total,
      z.name            AS zone_name,
      z.id              AS zone_id,
      SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN i.status = 'open'     THEN 1 ELSE 0 END) AS open
    FROM incidents i
    LEFT JOIN zones z ON z.id = i.zone_id
    WHERE 1=1
  `
  const params = []

  if (from) { query += ' AND i.created_at >= ?'; params.push(from) }
  if (to)   { query += ' AND i.created_at <= ?'; params.push(to)   }
  if (effectiveCompany) {
    query += ' AND i.company_id = ?'
    params.push(effectiveCompany)
  }

  query += ' GROUP BY i.type, z.id ORDER BY total DESC'

  const [rows] = await pool.execute(query, params)

  // Agrupar por tipo para el gráfico de Recharts
  const byType = _.groupBy(rows, 'type')
  const byZone = _.groupBy(rows.filter(r => r.zone_id), 'zone_name')

  return { by_type: byType, by_zone: byZone, raw: rows }
}

// ── Cobertura por zona ────────────────────────────────────
// Frecuencia real de recolección vs frecuencia programada
const getZoneCoverage = async ({ from, to }, requestingUser) => {
  const effectiveCompany = companyFilter(requestingUser)

  let query = `
    SELECT
      z.id          AS zone_id,
      z.name        AS zone_name,
      z.center_lat,
      z.center_lng,
      COUNT(DISTINCT re.id)                   AS total_executions,
      AVG(re.completion_pct)                  AS avg_completion_pct,
      SUM(CASE WHEN re.status IN ('completed','with_issues') THEN 1 ELSE 0 END)
                                              AS completed_executions,
      COUNT(DISTINCT i.id)                    AS total_incidents
    FROM zones z
    LEFT JOIN zone_waste_types zwt     ON zwt.zone_id = z.id
    LEFT JOIN collection_routes cr     ON cr.waste_type_id = zwt.waste_type_id
                                      AND cr.zone_id = z.id
    LEFT JOIN route_executions re      ON re.collection_route_id = cr.id
    LEFT JOIN incidents i              ON i.zone_id = z.id
    WHERE z.is_active = TRUE
  `
  const params = []

  if (from) { query += ' AND (re.execution_date >= ? OR re.id IS NULL)'; params.push(from) }
  if (to)   { query += ' AND (re.execution_date <= ? OR re.id IS NULL)'; params.push(to)   }
  if (effectiveCompany) {
    query += ' AND (re.company_id = ? OR re.id IS NULL)'
    params.push(effectiveCompany)
  }

  query += ' GROUP BY z.id ORDER BY avg_completion_pct ASC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// ── Métricas por conductor ────────────────────────────────
const getConductorMetrics = async ({ from, to, company_id }, requestingUser) => {
  const effectiveCompany = companyFilter(requestingUser) || company_id

  let query = `
    SELECT
      u.id            AS conductor_id,
      u.name          AS conductor_name,
      c.name          AS company_name,
      COUNT(re.id)    AS total_executions,
      AVG(re.completion_pct)  AS avg_completion_pct,
      SUM(CASE WHEN re.status = 'completed' THEN 1 ELSE 0 END)    AS completed,
      SUM(CASE WHEN re.status = 'with_issues' THEN 1 ELSE 0 END)  AS with_issues,
      COUNT(i.id)     AS total_incidents,
      AVG(TIMESTAMPDIFF(MINUTE, re.started_at, re.completed_at))  AS avg_duration_min
    FROM users u
    LEFT JOIN route_executions re ON re.conductor_id = u.id
    LEFT JOIN incidents i         ON i.conductor_id  = u.id
    LEFT JOIN companies c         ON c.id = u.company_id
    WHERE u.role = 'conductor'
    AND u.is_active = TRUE
  `
  const params = []

  if (from) { query += ' AND (re.execution_date >= ? OR re.id IS NULL)'; params.push(from) }
  if (to)   { query += ' AND (re.execution_date <= ? OR re.id IS NULL)'; params.push(to)   }
  if (effectiveCompany) {
    query += ' AND u.company_id = ?'
    params.push(effectiveCompany)
  }

  query += ' GROUP BY u.id ORDER BY avg_completion_pct DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// ── Dashboard — resumen ejecutivo ─────────────────────────
// Combina las métricas más importantes en una sola llamada
// Para el widget de métricas del panel municipal
const getDashboard = async (requestingUser) => {
  const today = dayjs().format('YYYY-MM-DD')
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const effectiveCompany = companyFilter(requestingUser)

  const companyParam = effectiveCompany ? [effectiveCompany] : []
  const companyWhere = effectiveCompany ? 'AND company_id = ?' : ''

  // Ejecuciones de hoy
  const [todayRows] = await pool.execute(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed'    THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'in_progress'  THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'with_issues'  THEN 1 ELSE 0 END) AS with_issues,
      SUM(CASE WHEN status = 'pending'      THEN 1 ELSE 0 END) AS pending
     FROM route_executions
     WHERE execution_date = ? ${companyWhere}`,
    [today, ...companyParam]
  )

  // Incidentes abiertos
  const [openIncidents] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM incidents
     WHERE status = 'open' ${companyWhere}`,
    companyParam
  )

  // Completitud del mes
  const [monthRows] = await pool.execute(
    `SELECT
      AVG(completion_pct) AS avg_pct,
      COUNT(*) AS total_executions
     FROM route_executions
     WHERE execution_date >= ? ${companyWhere}
     AND status IN ('completed','with_issues')`,
    [monthStart, ...companyParam]
  )

  // Conductores activos hoy
  const [activeConductors] = await pool.execute(
    `SELECT COUNT(DISTINCT conductor_id) AS total
     FROM route_executions
     WHERE execution_date = ?
     AND status IN ('in_progress','assigned') ${companyWhere}`,
    [today, ...companyParam]
  )

  return {
    today: {
      ...todayRows[0],
      date: today
    },
    month: {
      avg_completion_pct: monthRows[0].avg_pct
        ? parseFloat(monthRows[0].avg_pct).toFixed(2)
        : '0.00',
      total_executions: monthRows[0].total_executions,
      since: monthStart
    },
    open_incidents:      parseInt(openIncidents[0].total),
    active_conductors:   parseInt(activeConductors[0].total)
  }
}

module.exports = {
  getExecutionsSummary,
  getRouteMetrics,
  getIncidentStats,
  getZoneCoverage,
  getConductorMetrics,
  getDashboard
}