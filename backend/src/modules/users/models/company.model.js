'use strict'

const pool = require('../../../config/db')

// Obtiene todas las empresas
const findAll = async ({ is_active } = {}) => {
  let query = `
    SELECT
      c.id,
      c.name,
      c.cuit,
      c.email,
      c.phone,
      c.address,
      c.is_active,
      c.created_at,
      COUNT(u.id) AS total_users
    FROM companies c
    LEFT JOIN users u
      ON u.company_id = c.id
      AND u.deleted_at IS NULL
  `
  const params = []

  if (is_active !== undefined) {
    query += ' WHERE c.is_active = ?'
    params.push(is_active)
  }

  query += ' GROUP BY c.id ORDER BY c.name ASC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// Busca una empresa por ID con sus usuarios
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      id,
      name,
      cuit,
      email,
      phone,
      address,
      is_active,
      created_at,
      updated_at
    FROM companies
    WHERE id = ?
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

// Busca empresa por nombre — para validar duplicados
const findByName = async (name) => {
  const [rows] = await pool.execute(
    'SELECT id, name FROM companies WHERE name = ? LIMIT 1',
    [name]
  )
  return rows[0] || null
}

// Crea una empresa nueva
const create = async ({ name, cuit, email, phone, address }) => {
  const [result] = await pool.execute(
    `INSERT INTO companies (name, cuit, email, phone, address)
    VALUES (?, ?, ?, ?, ?)`,
    [
      name,
      cuit    || null,
      email   || null,
      phone   || null,
      address || null
    ]
  )
  return result.insertId
}

// Actualiza datos de una empresa
const update = async (id, fields) => {
  const allowed = ['name', 'cuit', 'email', 'phone', 'address', 'is_active']
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
    `UPDATE companies SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

// Desactiva una empresa — desactiva también sus usuarios
const deactivate = async (id) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Desactivar la empresa
    await conn.execute(
      'UPDATE companies SET is_active = FALSE WHERE id = ?',
      [id]
    )

    // Desactivar todos sus usuarios (operator_company y conductor)
    await conn.execute(
      'UPDATE users SET is_active = FALSE WHERE company_id = ?',
      [id]
    )

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

// Reactiva una empresa
const reactivate = async (id) => {
  await pool.execute(
    'UPDATE companies SET is_active = TRUE WHERE id = ?',
    [id]
  )
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  deactivate,
  reactivate
}