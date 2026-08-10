'use strict'

const pool = require('../../../config/db')

const findAll = async ({ zone_id, waste_type_id, company_id, is_active } = {}) => {
  let query = `
    SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.zone_id,
      cr.waste_type_id,
      cr.company_id,
      cr.geojson,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      cr.created_by,
      cr.created_at,
      cr.updated_at,
      z.name  AS zone_name,
      wt.name AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon,
      c.name  AS company_name,
      u.name  AS created_by_name
    FROM collection_routes cr
    LEFT JOIN zones z        ON z.id  = cr.zone_id
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    LEFT JOIN companies c    ON c.id  = cr.company_id
    LEFT JOIN users u        ON u.id  = cr.created_by
    WHERE 1=1
  `
  const params = []

  if (zone_id) {
    query += ' AND cr.zone_id = ?'
    params.push(zone_id)
  }
  if (waste_type_id) {
    query += ' AND cr.waste_type_id = ?'
    params.push(waste_type_id)
  }
  if (company_id) {
    query += ' AND cr.company_id = ?'
    params.push(company_id)
  }
  if (is_active !== undefined) {
    query += ' AND cr.is_active = ?'
    params.push(is_active)
  }

  query += ' ORDER BY cr.name ASC'

  const [rows] = await pool.execute(query, params)
  return rows
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.zone_id,
      cr.waste_type_id,
      cr.company_id,
      cr.geojson,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      cr.created_by,
      cr.created_at,
      cr.updated_at,
      z.name   AS zone_name,
      wt.name  AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon,
      c.name   AS company_name,
      u.name   AS created_by_name
    FROM collection_routes cr
    LEFT JOIN zones z        ON z.id  = cr.zone_id
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    LEFT JOIN companies c    ON c.id  = cr.company_id
    LEFT JOIN users u        ON u.id  = cr.created_by
    WHERE cr.id = ?
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

// Recorridos asignados a una empresa específica
// Usado por el operador empresa para ver su trabajo del día
const findByCompany = async (company_id, { is_active } = {}) => {
  let query = `
    SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.zone_id,
      cr.waste_type_id,
      cr.company_id,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      z.name   AS zone_name,
      wt.name  AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon
    FROM collection_routes cr
    LEFT JOIN zones z        ON z.id  = cr.zone_id
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    WHERE cr.company_id = ?
  `
  const params = [company_id]

  if (is_active !== undefined) {
    query += ' AND cr.is_active = ?'
    params.push(is_active)
  }

  query += ' ORDER BY cr.name ASC'

  const [rows] = await pool.execute(query, params)
  return rows
}

const create = async ({
  name, description, zone_id, waste_type_id,
  company_id, geojson, distance_km, duration_min, created_by
}) => {
  const [result] = await pool.execute(
    `INSERT INTO collection_routes
      (name, description, zone_id, waste_type_id, company_id,
       geojson, distance_km, duration_min, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      description  || null,
      zone_id,
      waste_type_id,
      company_id   || null,
      JSON.stringify(geojson),
      distance_km  || null,
      duration_min || null,
      created_by
    ]
  )
  return result.insertId
}

const update = async (id, fields) => {
  const allowed = [
    'name', 'description', 'zone_id', 'waste_type_id',
    'company_id', 'geojson', 'distance_km', 'duration_min', 'is_active'
  ]
  const updates = []
  const params  = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
      params.push(key === 'geojson' ? JSON.stringify(value) : value)
    }
  }

  if (updates.length === 0) return false

  params.push(id)
  await pool.execute(
    `UPDATE collection_routes SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

// Asignar o desasignar empresa a un recorrido
// Solo el municipio puede hacer esto
const assignCompany = async (id, company_id) => {
  await pool.execute(
    'UPDATE collection_routes SET company_id = ? WHERE id = ?',
    [company_id || null, id]
  )
}

const remove = async (id) => {
  await pool.execute(
    'UPDATE collection_routes SET is_active = FALSE WHERE id = ?',
    [id]
  )
}

module.exports = {
  findAll,
  findById,
  findByCompany,
  create,
  update,
  assignCompany,
  remove
}