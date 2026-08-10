'use strict'

const pool = require('../../../config/db')

// Obtiene todos los usuarios con filtros opcionales
// El admin ve todos, el municipal ve solo conductores y operadores
const findAll = async ({ role, company_id, is_active } = {}) => {
  let query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.company_id,
      u.phone,
      u.avatar_url,
      u.dni,
      u.license_number,
      u.license_expiry,
      u.totp_enabled,
      u.is_active,
      u.created_at,
      c.name AS company_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.deleted_at IS NULL
  `
  const params = []

  if (role) {
    query += ' AND u.role = ?'
    params.push(role)
  }

  if (company_id) {
    query += ' AND u.company_id = ?'
    params.push(company_id)
  }

  if (is_active !== undefined) {
    query += ' AND u.is_active = ?'
    params.push(is_active)
  }

  query += ' ORDER BY u.created_at DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

// Busca un usuario por ID con datos de empresa
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.company_id,
      u.phone,
      u.avatar_url,
      u.dni,
      u.license_number,
      u.license_expiry,
      u.totp_enabled,
      u.is_active,
      u.created_at,
      u.updated_at,
      c.name AS company_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.id = ?
    AND u.deleted_at IS NULL
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

// Busca un usuario por email — para validar duplicados
const findByEmail = async (email) => {
  const [rows] = await pool.execute(
    'SELECT id, email FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email]
  )
  return rows[0] || null
}

// Crea un usuario nuevo
// Solo el admin puede llamar a este método
const create = async ({ name, email, password_hash, role, company_id, phone, dni, license_number, license_expiry }) => {
  const [result] = await pool.execute(
    `INSERT INTO users
      (name, email, password_hash, role, company_id, phone, dni, license_number, license_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      email,
      password_hash,
      role,
      company_id   || null,
      phone        || null,
      dni          || null,
      license_number || null,
      license_expiry || null
    ]
  )
  return result.insertId
}

// Actualiza datos de un usuario
const update = async (id, fields) => {
  const allowed = ['name', 'email', 'phone', 'avatar_url', 'dni', 'license_number', 'license_expiry', 'role', 'company_id', 'is_active']
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
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    params
  )
  return true
}

// Actualiza el rol de un usuario — solo admin
const updateRole = async (id, role) => {
  await pool.execute(
    'UPDATE users SET role = ? WHERE id = ?',
    [role, id]
  )
}

// Soft delete — no borra el registro, solo marca deleted_at
// Preserva el historial operativo (GPS, ejecuciones, incidentes)
const softDelete = async (id) => {
  await pool.execute(
    'UPDATE users SET is_active = FALSE, deleted_at = NOW() WHERE id = ?',
    [id]
  )
}

// Reactiva una cuenta desactivada
const reactivate = async (id) => {
  await pool.execute(
    'UPDATE users SET is_active = TRUE, deleted_at = NULL WHERE id = ?',
    [id]
  )
}

// Verifica si una licencia de conductor está por vencer
// Usado para generar alertas preventivas
const findExpiringLicenses = async (daysAhead) => {
  const [rows] = await pool.execute(
    `SELECT
      u.id,
      u.name,
      u.email,
      u.license_number,
      u.license_expiry,
      u.company_id,
      c.name AS company_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.role = 'conductor'
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
    AND u.license_expiry IS NOT NULL
    AND u.license_expiry <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
    AND u.license_expiry >= CURDATE()
    ORDER BY u.license_expiry ASC`,
    [daysAhead]
  )
  return rows
}

module.exports = {
  findAll,
  findById,
  findByEmail,
  create,
  update,
  updateRole,
  softDelete,
  reactivate,
  findExpiringLicenses
}