'use strict'

const pool = require('../../../config/db')

// Registra una acción sensible en el log de auditoría
const log = async ({
  user_id, role, company_id,
  action, entity, entity_id,
  old_values, new_values,
  ip_address, user_agent
}) => {
  await pool.execute(
    `INSERT INTO audit_logs
      (user_id, role, company_id, action, entity, entity_id,
       old_values, new_values, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id    || null,
      role       || null,
      company_id || null,
      action,
      entity,
      entity_id  || null,
      old_values ? JSON.stringify(old_values) : null,
      new_values ? JSON.stringify(new_values) : null,
      ip_address || null,
      user_agent || null
    ]
  )
}

const findAll = async ({
  user_id, company_id, action,
  entity, from, to, limit = 50, offset = 0
} = {}) => {
  let query = `
    SELECT
      al.id,
      al.user_id,
      al.role,
      al.company_id,
      al.action,
      al.entity,
      al.entity_id,
      al.old_values,
      al.new_values,
      al.ip_address,
      al.created_at,
      u.name  AS user_name,
      u.email AS user_email,
      c.name  AS company_name
    FROM audit_logs al
    LEFT JOIN users u     ON u.id = al.user_id
    LEFT JOIN companies c ON c.id = al.company_id
    WHERE 1=1
  `
  const params = []

  if (user_id) {
    query += ' AND al.user_id = ?'
    params.push(user_id)
  }
  if (company_id) {
    query += ' AND al.company_id = ?'
    params.push(company_id)
  }
  if (action) {
    query += ' AND al.action = ?'
    params.push(action)
  }
  if (entity) {
    query += ' AND al.entity = ?'
    params.push(entity)
  }
  if (from) {
    query += ' AND al.created_at >= ?'
    params.push(from)
  }
  if (to) {
    query += ' AND al.created_at <= ?'
    params.push(to)
  }

  query += ` ORDER BY al.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`

  const [rows] = await pool.execute(query, params)

  // Parsear JSON fields
  // Después — MySQL 8 ya devuelve JSON como objeto, solo parseamos si es string
return rows.map(row => ({
  ...row,
  old_values: row.old_values
    ? (typeof row.old_values === 'string' ? JSON.parse(row.old_values) : row.old_values)
    : null,
  new_values: row.new_values
    ? (typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values)
    : null
}))
}

const countAll = async ({ user_id, company_id, action, entity, from, to } = {}) => {
  let query = `
    SELECT COUNT(*) AS total
    FROM audit_logs
    WHERE 1=1
  `
  const params = []

  if (user_id)    { query += ' AND user_id = ?';    params.push(user_id)    }
  if (company_id) { query += ' AND company_id = ?'; params.push(company_id) }
  if (action)     { query += ' AND action = ?';     params.push(action)     }
  if (entity)     { query += ' AND entity = ?';     params.push(entity)     }
  if (from)       { query += ' AND created_at >= ?'; params.push(from)      }
  if (to)         { query += ' AND created_at <= ?'; params.push(to)        }

  const [rows] = await pool.execute(query, params)
  return parseInt(rows[0].total)
}

module.exports = { log, findAll, countAll }