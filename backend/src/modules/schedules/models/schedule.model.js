'use strict'

const pool = require('../../../config/db')

const findAll = async ({ collection_route_id, company_id, shift, is_active } = {}) => {
  let query = `
    SELECT
      s.id,
      s.collection_route_id,
      s.company_id,
      s.shift,
      s.week_days,
      s.start_time,
      s.end_time,
      s.valid_from,
      s.valid_until,
      s.is_active,
      s.created_by,
      s.created_at,
      s.updated_at,
      cr.name AS route_name,
      c.name  AS company_name,
      u.name  AS created_by_name
    FROM schedules s
    LEFT JOIN collection_routes cr ON cr.id = s.collection_route_id
    LEFT JOIN companies c          ON c.id  = s.company_id
    LEFT JOIN users u              ON u.id  = s.created_by
    WHERE 1=1
  `
  const params = []

  if (collection_route_id) {
    query += ' AND s.collection_route_id = ?'
    params.push(collection_route_id)
  }
  if (company_id) {
    query += ' AND s.company_id = ?'
    params.push(company_id)
  }
  if (shift) {
    query += ' AND s.shift = ?'
    params.push(shift)
  }
  if (is_active !== undefined) {
    query += ' AND s.is_active = ?'
    params.push(is_active)
  }

  query += ' ORDER BY s.start_time ASC'

  const [rows] = await pool.execute(query, params)

  // week_days viene como string JSON de MySQL, parsearlo
  return rows.map(row => ({
    ...row,
    week_days: typeof row.week_days === 'string'
      ? JSON.parse(row.week_days)
      : row.week_days
  }))
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      s.id,
      s.collection_route_id,
      s.company_id,
      s.shift,
      s.week_days,
      s.start_time,
      s.end_time,
      s.valid_from,
      s.valid_until,
      s.is_active,
      s.created_by,
      s.created_at,
      s.updated_at,
      cr.name AS route_name,
      c.name  AS company_name,
      u.name  AS created_by_name
    FROM schedules s
    LEFT JOIN collection_routes cr ON cr.id = s.collection_route_id
    LEFT JOIN companies c          ON c.id  = s.company_id
    LEFT JOIN users u              ON u.id  = s.created_by
    WHERE s.id = ?
    LIMIT 1`,
    [id]
  )

  if (!rows[0]) return null

  return {
    ...rows[0],
    week_days: typeof rows[0].week_days === 'string'
      ? JSON.parse(rows[0].week_days)
      : rows[0].week_days
  }
}

// Cronogramas vigentes para una fecha específica
// Usado para saber qué recorridos corresponden a un día dado
const findActiveForDate = async (date, company_id = null) => {
  const dayOfWeek = new Date(date).getDay() || 7 // 1=lun ... 7=dom

  let query = `
    SELECT
      s.id,
      s.collection_route_id,
      s.company_id,
      s.shift,
      s.week_days,
      s.start_time,
      s.end_time,
      cr.name  AS route_name,
      c.name   AS company_name
    FROM schedules s
    LEFT JOIN collection_routes cr ON cr.id = s.collection_route_id
    LEFT JOIN companies c          ON c.id  = s.company_id
    WHERE s.is_active = TRUE
    AND s.valid_from <= ?
    AND (s.valid_until IS NULL OR s.valid_until >= ?)
    AND JSON_CONTAINS(s.week_days, ?)
  `
  const params = [date, date, String(dayOfWeek)]

  if (company_id) {
    query += ' AND s.company_id = ?'
    params.push(company_id)
  }

  query += ' ORDER BY s.start_time ASC'

  const [rows] = await pool.execute(query, params)

  return rows.map(row => ({
    ...row,
    week_days: typeof row.week_days === 'string'
      ? JSON.parse(row.week_days)
      : row.week_days
  }))
}

const create = async ({
  collection_route_id, company_id, shift,
  week_days, start_time, end_time,
  valid_from, valid_until, created_by
}) => {
  const [result] = await pool.execute(
    `INSERT INTO schedules
      (collection_route_id, company_id, shift, week_days,
       start_time, end_time, valid_from, valid_until, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      collection_route_id,
      company_id   || null,
      shift,
      JSON.stringify(week_days),
      start_time,
      end_time,
      valid_from,
      valid_until  || null,
      created_by
    ]
  )
  return result.insertId
}

const update = async (id, fields) => {
  const allowed = [
    'collection_route_id', 'company_id', 'shift', 'week_days',
    'start_time', 'end_time', 'valid_from', 'valid_until', 'is_active'
  ]
  const updates = []
  const params  = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
      params.push(key === 'week_days' ? JSON.stringify(value) : value)
    }
  }

  if (updates.length === 0) return false

  params.push(id)
  await pool.execute(
    `UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

const remove = async (id) => {
  await pool.execute(
    'UPDATE schedules SET is_active = FALSE WHERE id = ?',
    [id]
  )
}

// ── Consulta pública (ciudadanos, sin login) ─────────────
// Cronogramas vigentes que pasan por un barrio. Un barrio puede estar
// en más de un recorrido (por ejemplo, domiciliarios y reciclables),
// por eso se llega al cronograma a través de route_zones.
// Solo devuelve datos de servicio: no expone conductores, recorridos
// internos ni ids que no necesita el ciudadano.
// Devuelve null si el barrio no existe o está inactivo.
const findPublicByZone = async (zoneId) => {
  const [zoneRows] = await pool.execute(
    'SELECT id, name FROM zones WHERE id = ? AND is_active = TRUE',
    [zoneId]
  )
  if (!zoneRows[0]) return null

  const [rows] = await pool.execute(
    `SELECT DISTINCT
       s.id,
       s.shift,
       s.week_days,
       s.start_time,
       s.end_time,
       wt.name  AS waste_type,
       wt.color AS waste_type_color,
       c.name   AS company_name
     FROM route_zones rz
     INNER JOIN collection_routes cr ON cr.id = rz.collection_route_id
                                    AND cr.is_active = TRUE
     INNER JOIN schedules s          ON s.collection_route_id = cr.id
                                    AND s.is_active = TRUE
                                    AND s.valid_from <= CURDATE()
                                    AND (s.valid_until IS NULL OR s.valid_until >= CURDATE())
     LEFT JOIN waste_types wt        ON wt.id = cr.waste_type_id
     LEFT JOIN companies c           ON c.id  = s.company_id
     WHERE rz.zone_id = ?
     ORDER BY s.start_time ASC`,
    [zoneId]
  )

  return {
    zone: zoneRows[0],
    schedules: rows.map(row => ({
      ...row,
      week_days: typeof row.week_days === 'string'
        ? JSON.parse(row.week_days)
        : row.week_days
    }))
  }
}

module.exports = {
  findAll,
  findPublicByZone,
  findById,
  findActiveForDate,
  create,
  update,
  remove
}