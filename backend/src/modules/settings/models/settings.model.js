'use strict'

const pool = require('../../../config/db')

const findAll = async () => {
  const [rows] = await pool.execute(
    `SELECT \`key\`, value, type, description, updated_by, updated_at
     FROM system_settings
     ORDER BY \`key\` ASC`
  )
  return rows
}

const findByKey = async (key) => {
  const [rows] = await pool.execute(
    `SELECT \`key\`, value, type, description, updated_by, updated_at
     FROM system_settings
     WHERE \`key\` = ? LIMIT 1`,
    [key]
  )
  return rows[0] || null
}

const update = async (key, value, updatedBy) => {
  const [result] = await pool.execute(
    `UPDATE system_settings
     SET value = ?, updated_by = ?
     WHERE \`key\` = ?`,
    [String(value), updatedBy || null, key]
  )
  return result.affectedRows > 0
}

module.exports = { findAll, findByKey, update }