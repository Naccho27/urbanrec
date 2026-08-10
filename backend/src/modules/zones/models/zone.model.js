'use strict'

const pool = require('../../../config/db')

const findAll = async ({ is_active } = {}) => {
  let query = `
    SELECT
      z.id,
      z.name,
      z.description,
      z.geojson,
      z.center_lat,
      z.center_lng,
      z.is_active,
      z.created_by,
      z.created_at,
      z.updated_at,
      u.name  AS created_by_name,
      -- Tipos de residuo asociados a esta zona como JSON array
      JSON_ARRAYAGG(
        IF(wt.id IS NOT NULL,
          JSON_OBJECT(
            'id',    wt.id,
            'name',  wt.name,
            'color', wt.color,
            'icon',  wt.icon
          ),
          NULL
        )
      ) AS waste_types
    FROM zones z
    LEFT JOIN users u ON u.id = z.created_by
    LEFT JOIN zone_waste_types zwt ON zwt.zone_id = z.id
    LEFT JOIN waste_types wt ON wt.id = zwt.waste_type_id
  `
  const params = []

  if (is_active !== undefined) {
    query += ' WHERE z.is_active = ?'
    params.push(is_active)
  }

  query += ' GROUP BY z.id ORDER BY z.name ASC'

  const [rows] = await pool.execute(query, params)

  // Limpiar nulls del JSON_ARRAYAGG cuando no hay waste_types
  return rows.map(row => ({
    ...row,
    waste_types: (row.waste_types || []).filter(wt => wt !== null)
  }))
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      z.id,
      z.name,
      z.description,
      z.geojson,
      z.center_lat,
      z.center_lng,
      z.is_active,
      z.created_by,
      z.created_at,
      z.updated_at,
      u.name AS created_by_name,
      JSON_ARRAYAGG(
        IF(wt.id IS NOT NULL,
          JSON_OBJECT(
            'id',    wt.id,
            'name',  wt.name,
            'color', wt.color,
            'icon',  wt.icon
          ),
          NULL
        )
      ) AS waste_types
    FROM zones z
    LEFT JOIN users u ON u.id = z.created_by
    LEFT JOIN zone_waste_types zwt ON zwt.zone_id = z.id
    LEFT JOIN waste_types wt ON wt.id = zwt.waste_type_id
    WHERE z.id = ?
    GROUP BY z.id
    LIMIT 1`,
    [id]
  )

  if (!rows[0]) return null

  return {
    ...rows[0],
    waste_types: (rows[0].waste_types || []).filter(wt => wt !== null)
  }
}

// Busca zonas cercanas a unas coordenadas
// Usado cuando el ciudadano busca por dirección
const findByCoords = async (lat, lng, radiusKm = 5) => {
  const [rows] = await pool.execute(
    `SELECT
      id,
      name,
      description,
      center_lat,
      center_lng,
      is_active,
      -- Distancia aproximada en km usando la fórmula esférica
      (6371 * ACOS(
        COS(RADIANS(?)) * COS(RADIANS(center_lat)) *
        COS(RADIANS(center_lng) - RADIANS(?)) +
        SIN(RADIANS(?)) * SIN(RADIANS(center_lat))
      )) AS distance_km
    FROM zones
    WHERE is_active = TRUE
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 10`,
    [lat, lng, lat, radiusKm]
  )
  return rows
}

const create = async ({ name, description, geojson, center_lat, center_lng, created_by }) => {
  const [result] = await pool.execute(
    `INSERT INTO zones (name, description, geojson, center_lat, center_lng, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name,
      description  || null,
      JSON.stringify(geojson),
      center_lat,
      center_lng,
      created_by
    ]
  )
  return result.insertId
}

// Asocia tipos de residuo a una zona
// Reemplaza todas las asociaciones existentes
const setWasteTypes = async (zoneId, wasteTypeIds) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Borrar asociaciones actuales
    await conn.execute(
      'DELETE FROM zone_waste_types WHERE zone_id = ?',
      [zoneId]
    )

    // Insertar las nuevas
    if (wasteTypeIds && wasteTypeIds.length > 0) {
      const values = wasteTypeIds.map(wtId => [zoneId, wtId])
      await conn.query(
        'INSERT INTO zone_waste_types (zone_id, waste_type_id) VALUES ?',
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
  const allowed = ['name', 'description', 'geojson', 'center_lat', 'center_lng', 'is_active']
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
    `UPDATE zones SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

const remove = async (id) => {
  await pool.execute(
    'UPDATE zones SET is_active = FALSE WHERE id = ?',
    [id]
  )
}

module.exports = {
  findAll,
  findById,
  findByCoords,
  create,
  setWasteTypes,
  update,
  remove
}