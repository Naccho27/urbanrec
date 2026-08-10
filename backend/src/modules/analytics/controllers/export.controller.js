'use strict'

const pool          = require('../../../config/db')
const exportService = require('../../../shared/services/export.service')
const auditService  = require('../../audit/services/audit.service')
const { fail }      = require('../../../shared/utils/responses')
const { ROLES }     = require('../../../shared/utils/roles')
const dayjs         = require('dayjs')

// Helper para parsear filtros de fecha
const getDateFilters = (query) => ({
  from: query.from || dayjs().startOf('month').format('YYYY-MM-DD'),
  to:   query.to   || dayjs().format('YYYY-MM-DD')
})

// Helper para aplicar filtro de empresa
const getCompanyFilter = (requestingUser, queryCompanyId) => {
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    return requestingUser.company_id
  }
  return queryCompanyId || null
}

// ── Exportar ejecuciones ──────────────────────────────────

const exportExecutions = async (req, res) => {
  const { from, to }  = getDateFilters(req.query)
  const company_id    = getCompanyFilter(req.user, req.query.company_id)
  const format        = req.query.format || 'csv'

  let query = `
    SELECT
      re.id,
      re.execution_date,
      cr.name           AS recorrido,
      c.name            AS empresa,
      u.name            AS conductor,
      re.status         AS estado,
      re.completion_pct AS completitud_pct,
      re.zones_total    AS zonas_total,
      re.zones_visited  AS zonas_visitadas,
      re.distance_covered_km AS km_recorridos,
      re.started_at,
      re.completed_at
    FROM route_executions re
    LEFT JOIN collection_routes cr ON cr.id = re.collection_route_id
    LEFT JOIN companies c          ON c.id  = re.company_id
    LEFT JOIN users u              ON u.id  = re.conductor_id
    WHERE re.execution_date BETWEEN ? AND ?
  `
  const params = [from, to]

  if (company_id) {
    query += ' AND re.company_id = ?'
    params.push(company_id)
  }

  query += ' ORDER BY re.execution_date DESC, re.id DESC'

  const [rows] = await pool.execute(query, params)

  await auditService.record({
    requestingUser: req.user,
    action:         auditService.ACTIONS.EXPORT,
    entity:         auditService.ENTITIES.EXECUTION,
    new_values:     { format, from, to, total: rows.length },
    ip_address:     auditService.fromRequest(req).ip_address
  })

  if (format === 'pdf') {
    return exportService.toPDF(res, {
      title:    `Reporte de Ejecuciones — ${from} al ${to}`,
      filename: `ejecuciones_${from}_${to}`,
      headers:  ['ID', 'Fecha', 'Recorrido', 'Empresa', 'Conductor', 'Estado', 'Completitud %', 'Zonas', 'Km'],
      rows:     rows.map(r => [
        r.id, r.execution_date, r.recorrido, r.empresa,
        r.conductor, r.estado, r.completitud_pct,
        `${r.zonas_visitadas || 0}/${r.zonas_total || 0}`,
        r.km_recorridos || '-'
      ])
    })
  }

  // CSV por defecto
  const csv = exportService.toCSV(rows, [
    { label: 'ID',          value: 'id' },
    { label: 'Fecha',       value: 'execution_date' },
    { label: 'Recorrido',   value: 'recorrido' },
    { label: 'Empresa',     value: 'empresa' },
    { label: 'Conductor',   value: 'conductor' },
    { label: 'Estado',      value: 'estado' },
    { label: 'Completitud', value: 'completitud_pct' },
    { label: 'Zonas total', value: 'zonas_total' },
    { label: 'Zonas visitadas', value: 'zonas_visitadas' },
    { label: 'Km recorridos',   value: 'km_recorridos' }
  ])

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="ejecuciones_${from}_${to}.csv"`)
  return res.send(csv)
}

// ── Exportar incidentes ───────────────────────────────────

const exportIncidents = async (req, res) => {
  const { from, to } = getDateFilters(req.query)
  const company_id   = getCompanyFilter(req.user, req.query.company_id)
  const format       = req.query.format || 'csv'

  let query = `
    SELECT
      i.id,
      i.created_at      AS fecha,
      i.type            AS tipo,
      i.description     AS descripcion,
      i.status          AS estado,
      z.name            AS zona,
      c.name            AS empresa,
      u.name            AS conductor,
      i.resolved_at,
      i.resolution_notes AS resolucion
    FROM incidents i
    LEFT JOIN zones z     ON z.id = i.zone_id
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users u     ON u.id = i.conductor_id
    WHERE DATE(i.created_at) BETWEEN ? AND ?
  `
  const params = [from, to]

  if (company_id) {
    query += ' AND i.company_id = ?'
    params.push(company_id)
  }

  query += ' ORDER BY i.created_at DESC'

  const [rows] = await pool.execute(query, params)

  await auditService.record({
    requestingUser: req.user,
    action:         auditService.ACTIONS.EXPORT,
    entity:         auditService.ENTITIES.INCIDENT,
    new_values:     { format, from, to, total: rows.length },
    ip_address:     auditService.fromRequest(req).ip_address
  })

  if (format === 'pdf') {
    return exportService.toPDF(res, {
      title:    `Reporte de Incidentes — ${from} al ${to}`,
      filename: `incidentes_${from}_${to}`,
      headers:  ['ID', 'Fecha', 'Tipo', 'Zona', 'Empresa', 'Conductor', 'Estado'],
      rows:     rows.map(r => [
        r.id, dayjs(r.fecha).format('DD/MM/YYYY HH:mm'),
        r.tipo, r.zona || '-', r.empresa, r.conductor, r.estado
      ])
    })
  }

  const csv = exportService.toCSV(rows, [
    { label: 'ID',          value: 'id' },
    { label: 'Fecha',       value: 'fecha' },
    { label: 'Tipo',        value: 'tipo' },
    { label: 'Descripción', value: 'descripcion' },
    { label: 'Estado',      value: 'estado' },
    { label: 'Zona',        value: 'zona' },
    { label: 'Empresa',     value: 'empresa' },
    { label: 'Conductor',   value: 'conductor' },
    { label: 'Resolución',  value: 'resolucion' }
  ])

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="incidentes_${from}_${to}.csv"`)
  return res.send(csv)
}

// ── Reporte de cumplimiento por empresa ───────────────────
// Solo operador municipal y admin

const exportComplianceReport = async (req, res) => {
  if (req.user.role === ROLES.OPERATOR_COMPANY) {
    return fail(res, 'Sin permisos para este reporte', 403)
  }

  const { from, to } = getDateFilters(req.query)
  const format       = req.query.format || 'pdf'

  const [rows] = await pool.execute(
  `SELECT
    c.id                  AS empresa_id,
    c.name                AS empresa,
    COUNT(DISTINCT re.id) AS total_ejecuciones,
    SUM(CASE WHEN re.status = 'completed'   THEN 1 ELSE 0 END) AS completadas,
    SUM(CASE WHEN re.status = 'with_issues' THEN 1 ELSE 0 END) AS con_incidencias,
    SUM(CASE WHEN re.status = 'cancelled'   THEN 1 ELSE 0 END) AS canceladas,
    AVG(re.completion_pct)                  AS completitud_promedio,
    COUNT(DISTINCT i.id)                    AS total_incidentes
  FROM companies c
  LEFT JOIN route_executions re
    ON re.company_id = c.id
    AND re.execution_date BETWEEN ? AND ?
  LEFT JOIN incidents i
    ON i.company_id = c.id
    AND DATE(i.created_at) BETWEEN ? AND ?
  WHERE c.is_active = TRUE
  GROUP BY c.id, c.name
  ORDER BY completitud_promedio DESC`,
  [from, to, from, to]
)

  await auditService.record({
    requestingUser: req.user,
    action:         auditService.ACTIONS.EXPORT,
    entity:         'compliance_report',
    new_values:     { format, from, to },
    ip_address:     auditService.fromRequest(req).ip_address
  })

  if (format === 'csv') {
    const csv = exportService.toCSV(rows, [
      { label: 'Empresa',               value: 'empresa' },
      { label: 'Total ejecuciones',     value: 'total_ejecuciones' },
      { label: 'Completadas',           value: 'completadas' },
      { label: 'Con incidencias',       value: 'con_incidencias' },
      { label: 'Canceladas',            value: 'canceladas' },
      { label: 'Completitud promedio',  value: 'completitud_promedio' },
      { label: 'Total incidentes',      value: 'total_incidentes' }
    ])

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="cumplimiento_${from}_${to}.csv"`)
    return res.send(csv)
  }

  return exportService.toPDF(res, {
    title:    `Reporte de Cumplimiento por Empresa — ${from} al ${to}`,
    filename: `cumplimiento_${from}_${to}`,
    headers:  ['Empresa', 'Ejecuciones', 'Completadas', 'Incidencias', 'Canceladas', 'Completitud %', 'Incidentes'],
    rows:     rows.map(r => [
      r.empresa,
      r.total_ejecuciones,
      r.completadas,
      r.con_incidencias,
      r.canceladas,
      r.completitud_promedio ? parseFloat(r.completitud_promedio).toFixed(2) : '0.00',
      r.total_incidentes
    ])
  })
}

module.exports = { exportExecutions, exportIncidents, exportComplianceReport }