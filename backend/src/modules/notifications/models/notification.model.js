'use strict'

const pool = require('../../../config/db')

const findByUser = async (userId, { is_read, limit = 20 } = {}) => {
  // Convertir limit a entero seguro para interpolarlo directo en la query
  // No se puede usar ? para LIMIT con pool.execute en mysql2
  const safeLimit = parseInt(limit) || 20

  let query = `
    SELECT
      id, user_id, type, title, body,
      channel, is_read, entity, entity_id, sent_at
    FROM notifications
    WHERE user_id = ?
  `
  const params = [userId]

  if (is_read !== undefined) {
    query += ' AND is_read = ?'
    params.push(is_read)
  }

  // LIMIT como número directo — no como parámetro preparado
  query += ` ORDER BY sent_at DESC LIMIT ${safeLimit}`

  const [rows] = await pool.execute(query, params)
  return rows
}

const countUnread = async (userId) => {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  )
  return rows[0].total
}

const create = async ({ user_id, type, title, body, channel, entity, entity_id }) => {
  const [result] = await pool.execute(
    `INSERT INTO notifications
      (user_id, type, title, body, channel, entity, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      type,
      title,
      body,
      channel   || 'in_app',
      entity    || null,
      entity_id || null
    ]
  )
  return result.insertId
}

const markAsRead = async (id, userId) => {
  await pool.execute(
    'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
    [id, userId]
  )
}

const markAllAsRead = async (userId) => {
  await pool.execute(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
    [userId]
  )
}

module.exports = {
  findByUser,
  countUnread,
  create,
  markAsRead,
  markAllAsRead
}