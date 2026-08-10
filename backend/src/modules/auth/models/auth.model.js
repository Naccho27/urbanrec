'use strict'

const pool = require('../../../config/db')

// Busca un usuario por email incluyendo todos los campos
// necesarios para el proceso de login y TOTP.
// Retorna el usuario o null si no existe.
const findByEmail = async (email) => {
  const [rows] = await pool.execute(
    `SELECT
      id,
      name,
      email,
      password_hash,
      role,
      company_id,
      totp_secret,
      totp_enabled,
      is_active,
      deleted_at
    FROM users
    WHERE email = ?
    LIMIT 1`,
    [email]
  )
  return rows[0] || null
}

// Busca un usuario por ID — usado para refresh token
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      id,
      name,
      email,
      role,
      company_id,
      totp_enabled,
      is_active,
      deleted_at
    FROM users
    WHERE id = ?
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

// Registra un intento de login (exitoso o fallido)
// para el dashboard de seguridad del admin
const registerLoginAttempt = async ({ email, success, ip_address, user_agent }) => {
  await pool.execute(
    `INSERT INTO login_attempts
      (email, success, ip_address, user_agent)
    VALUES (?, ?, ?, ?)`,
    [email, success, ip_address || null, user_agent || null]
  )
}

module.exports = {
  findByEmail,
  findById,
  registerLoginAttempt
}