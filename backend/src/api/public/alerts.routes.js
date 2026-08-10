'use strict'

const { Router }   = require('express')
const asyncWrapper = require('../../shared/middlewares/asyncWrapper')
const { ok }       = require('../../shared/utils/responses')
const pool         = require('../../config/db')

const router = Router()

// GET /api/v1/public/alerts?zone_id=1
// Sin autenticación — cualquier ciudadano puede ver los avisos activos
// Devuelve los últimos 10 avisos de servicio de las últimas 24 horas
router.get('/', asyncWrapper(async (req, res) => {
  const { zone_id } = req.query

  let query = `
    SELECT id, title, body, entity_id AS zone_id, sent_at
    FROM notifications
    WHERE type = 'service_alert'
    AND sent_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    AND user_id IS NULL
  `
  const params = []

  if (zone_id) {
    query += ' AND entity_id = ?'
    params.push(zone_id)
  }

  query += ' ORDER BY sent_at DESC LIMIT 10'

  const [alerts] = await pool.execute(query, params)
  return ok(res, { alerts, total: alerts.length })
}))

module.exports = router