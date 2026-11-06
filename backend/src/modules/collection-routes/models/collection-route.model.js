'use strict'

const pool = require('../../../config/db')

// Normaliza el array de zonas que devuelve JSON_ARRAYAGG:
// filtra los NULL (recorridos sin zonas) y ordena por visit_order
const normalizeZones = (row) => ({
  ...row,
  zones: (row.zones || [])
    .filter(z => z !== null)
    .sort((a, b) => (a.visit_order ?? 999) - (b.visit_order ?? 999))
})

const findAll = async ({ zone_id, waste_type_id, company_id, is_active } = {}) => {
  let query = `
    SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.waste_type_id,
      cr.company_id,
      cr.geojson,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      cr.created_by,
      cr.created_at,
      cr.updated_at,
      wt.name  AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon,
      c.name   AS company_name,
      u.name   AS created_by_name,
      COUNT(DISTINCT rz.zone_id) AS zones_count,
      -- Zonas del recorrido con su orden de visita
      JSON_ARRAYAGG(
        IF(z.id IS NOT NULL,
          JSON_OBJECT(
            'id',          z.id,
            'name',        z.name,
            'visit_order', rz.visit_order,
            'center_lat',  z.center_lat,
            'center_lng',  z.center_lng
          ),
          NULL
        )
      ) AS zones
    FROM collection_routes cr
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    LEFT JOIN companies c    ON c.id  = cr.company_id
    LEFT JOIN users u        ON u.id  = cr.created_by
    LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
    LEFT JOIN zones z        ON z.id  = rz.zone_id
    WHERE 1=1
  `
  const params = []

  // El filtro por zona usa EXISTS para no recortar el array de zonas:
  // si filtrara con el JOIN, el recorrido aparecería con una sola zona
  if (zone_id) {
    query += `
      AND EXISTS (
        SELECT 1 FROM route_zones rz2
        WHERE rz2.collection_route_id = cr.id AND rz2.zone_id = ?
      )`
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

  query += ' GROUP BY cr.id ORDER BY cr.name ASC'

  const [rows] = await pool.execute(query, params)
  return rows.map(normalizeZones)
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.waste_type_id,
      cr.company_id,
      cr.geojson,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      cr.created_by,
      cr.created_at,
      cr.updated_at,
      wt.name  AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon,
      c.name   AS company_name,
      u.name   AS created_by_name,
      COUNT(DISTINCT rz.zone_id) AS zones_count,
      JSON_ARRAYAGG(
        IF(z.id IS NOT NULL,
          JSON_OBJECT(
            'id',          z.id,
            'name',        z.name,
            'visit_order', rz.visit_order,
            'center_lat',  z.center_lat,
            'center_lng',  z.center_lng
          ),
          NULL
        )
      ) AS zones
    FROM collection_routes cr
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    LEFT JOIN companies c    ON c.id  = cr.company_id
    LEFT JOIN users u        ON u.id  = cr.created_by
    LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
    LEFT JOIN zones z        ON z.id  = rz.zone_id
    WHERE cr.id = ?
    GROUP BY cr.id
    LIMIT 1`,
    [id]
  )

  if (!rows[0]) return null
  return normalizeZones(rows[0])
}

// Recorridos asignados a una empresa específica
// Usado por el operador empresa para ver su trabajo del día
const findByCompany = async (company_id, { is_active } = {}) => {
  let query = `
    SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.waste_type_id,
      cr.company_id,
      cr.distance_km,
      cr.duration_min,
      cr.is_active,
      wt.name  AS waste_type_name,
      wt.color AS waste_type_color,
      wt.icon  AS waste_type_icon,
      COUNT(DISTINCT rz.zone_id) AS zones_count,
      JSON_ARRAYAGG(
        IF(z.id IS NOT NULL,
          JSON_OBJECT(
            'id',          z.id,
            'name',        z.name,
            'visit_order', rz.visit_order
          ),
          NULL
        )
      ) AS zones
    FROM collection_routes cr
    LEFT JOIN waste_types wt ON wt.id = cr.waste_type_id
    LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
    LEFT JOIN zones z        ON z.id  = rz.zone_id
    WHERE cr.company_id = ?
  `
  const params = [company_id]

  if (is_active !== undefined) {
    query += ' AND cr.is_active = ?'
    params.push(is_active)
  }

  query += ' GROUP BY cr.id ORDER BY cr.name ASC'

  const [rows] = await pool.execute(query, params)
  return rows.map(normalizeZones)
}

// Zonas de un recorrido en orden de visita
// Lo usa tracking.service para evaluar proximidad GPS
const getZones = async (collection_route_id) => {
  const [rows] = await pool.execute(
    `SELECT
      z.id,
      z.name,
      z.center_lat,
      z.center_lng,
      rz.visit_order
    FROM route_zones rz
    INNER JOIN zones z ON z.id = rz.zone_id
    WHERE rz.collection_route_id = ?
    AND z.is_active = TRUE
    ORDER BY rz.visit_order ASC`,
    [collection_route_id]
  )
  return rows
}

const create = async ({
  name, description, waste_type_id,
  company_id, geojson, distance_km, duration_min, created_by
}) => {
  const [result] = await pool.execute(
    `INSERT INTO collection_routes
      (name, description, waste_type_id, company_id,
       geojson, distance_km, duration_min, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      description  || null,
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

// Asocia zonas a un recorrido con su orden de visita.
// Reemplaza todas las asociaciones existentes.
// zoneIds es un array de IDs: el índice define el visit_order
const setZones = async (routeId, zoneIds) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.execute(
      'DELETE FROM route_zones WHERE collection_route_id = ?',
      [routeId]
    )

    if (zoneIds && zoneIds.length > 0) {
      const values = zoneIds.map((zId, i) => [routeId, zId, i + 1])
      await conn.query(
        'INSERT INTO route_zones (collection_route_id, zone_id, visit_order) VALUES ?',
        [values]
      )
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

const update = async (id, fields) => {
  const allowed = [
    'name', 'description', 'waste_type_id',
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
  getZones,
  create,
  setZones,
  update,
  assignCompany,
  remove
}