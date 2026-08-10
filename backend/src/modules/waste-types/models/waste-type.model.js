'use strict'

const pool = require('../../../config/db')

const findAll = async ({ is_active } = {}) => {
  let query = `
    SELECT id, name, description, color, icon, is_active, created_at, updated_at
    FROM waste_types
  `
  const params = []

  if (is_active !== undefined) {
    query += ' WHERE is_active = ?'
    params.push(is_active)
  }

  query += ' ORDER BY name ASC'

  const [rows] = await pool.execute(query, params)
  return rows
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, description, color, icon, is_active, created_at, updated_at
     FROM waste_types WHERE id = ? LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

const findByName = async (name) => {
  const [rows] = await pool.execute(
    'SELECT id, name FROM waste_types WHERE name = ? LIMIT 1',
    [name]
  )
  return rows[0] || null
}

const create = async ({ name, description, color, icon }) => {
  const [result] = await pool.execute(
    `INSERT INTO waste_types (name, description, color, icon)
     VALUES (?, ?, ?, ?)`,
    [name, description || null, color || null, icon || null]
  )
  return result.insertId
}

const update = async (id, fields) => {
  const allowed = ['name', 'description', 'color', 'icon', 'is_active']
  const updates = []
  const params  = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
      params.push(value)
    }
  }

  if (updates.length === 0) return false

  params.push(id)
  await pool.execute(
    `UPDATE waste_types SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

const remove = async (id) => {
  // Soft delete — desactiva en lugar de borrar
  // para no romper recorridos y zonas que referencian este tipo
  await pool.execute(
    'UPDATE waste_types SET is_active = FALSE WHERE id = ?',
    [id]
  )
}

module.exports = { findAll, findById, findByName, create, update, remove }