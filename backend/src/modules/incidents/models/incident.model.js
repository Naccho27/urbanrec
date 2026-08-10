'use strict'

const pool = require('../../../config/db')

const findAll = async ({ execution_id, company_id, zone_id, type, status } = {}) => {
  let query = `
    SELECT
      i.id,
      i.execution_id,
      i.conductor_id,
      i.company_id,
      i.zone_id,
      i.type,
      i.description,
      i.latitude,
      i.longitude,
      i.photo_url,
      i.status,
      i.resolved_by,
      i.resolved_at,
      i.resolution_notes,
      i.created_at,
      i.updated_at,
      u.name  AS conductor_name,
      z.name  AS zone_name,
      c.name  AS company_name,
      r.name  AS resolver_name
    FROM incidents i
    LEFT JOIN users u    ON u.id = i.conductor_id
    LEFT JOIN zones z    ON z.id = i.zone_id
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users r    ON r.id = i.resolved_by
    WHERE 1=1
  `
  const params = []

  if (execution_id) {
    query += ' AND i.execution_id = ?'
    params.push(execution_id)
  }
  if (company_id) {
    query += ' AND i.company_id = ?'
    params.push(company_id)
  }
  if (zone_id) {
    query += ' AND i.zone_id = ?'
    params.push(zone_id)
  }
  if (type) {
    query += ' AND i.type = ?'
    params.push(type)
  }
  if (status) {
    query += ' AND i.status = ?'
    params.push(status)
  }

  query += ' ORDER BY i.created_at DESC'

  const [rows] = await pool.execute(query, params)
  return rows
}

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      i.id,
      i.execution_id,
      i.conductor_id,
      i.company_id,
      i.zone_id,
      i.type,
      i.description,
      i.latitude,
      i.longitude,
      i.photo_url,
      i.status,
      i.resolved_by,
      i.resolved_at,
      i.resolution_notes,
      i.created_at,
      i.updated_at,
      u.name  AS conductor_name,
      z.name  AS zone_name,
      c.name  AS company_name,
      r.name  AS resolver_name
    FROM incidents i
    LEFT JOIN users u     ON u.id = i.conductor_id
    LEFT JOIN zones z     ON z.id = i.zone_id
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users r     ON r.id = i.resolved_by
    WHERE i.id = ?
    LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

const create = async ({
  execution_id, conductor_id, company_id, zone_id,
  type, description, latitude, longitude, photo_url
}) => {
  const [result] = await pool.execute(
    `INSERT INTO incidents
      (execution_id, conductor_id, company_id, zone_id,
       type, description, latitude, longitude, photo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      execution_id,
      conductor_id,
      company_id,
      zone_id    || null,
      type,
      description,
      latitude   || null,
      longitude  || null,
      photo_url  || null
    ]
  )
  return result.insertId
}

const updateStatus = async (id, status, { resolved_by, resolution_notes } = {}) => {
  await pool.execute(
    `UPDATE incidents
     SET status = ?,
         resolved_by = ?,
         resolved_at = ?,
         resolution_notes = ?
     WHERE id = ?`,
    [
      status,
      resolved_by      || null,
      status === 'resolved' ? new Date() : null,
      resolution_notes || null,
      id
    ]
  )
}

module.exports = { findAll, findById, create, updateStatus }