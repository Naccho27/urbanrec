'use strict'

const notificationModel = require('../models/notification.model')
const { ok }            = require('../../../shared/utils/responses')

// GET /api/v1/notifications — notificaciones del usuario logueado
const getMyNotifications = async (req, res) => {
  const userId   = req.user.id
  const is_read  = req.query.is_read !== undefined
    ? req.query.is_read === 'true'
    : undefined
  const limit    = parseInt(req.query.limit) || 20

  const notifications = await notificationModel.findByUser(userId, { is_read, limit })
  const unread        = await notificationModel.countUnread(userId)

  return ok(res, { notifications, unread, total: notifications.length })
}

// PATCH /api/v1/notifications/:id/read
const markAsRead = async (req, res) => {
  await notificationModel.markAsRead(req.params.id, req.user.id)
  return ok(res, null, 'Notificación marcada como leída')
}

// PATCH /api/v1/notifications/read-all
const markAllAsRead = async (req, res) => {
  await notificationModel.markAllAsRead(req.user.id)
  return ok(res, null, 'Todas las notificaciones marcadas como leídas')
}

// POST /api/v1/notifications/broadcast
const broadcastAlert = async (req, res) => {
  const { title, body, zone_id } = req.body

  const notifService = require('../services/notifications.service')
  const result = await notifService.broadcastServiceAlert({
    zone_id:       zone_id   || null,
    title,
    body,
    sentByUserId:  req.user.id
  })

  return ok(res, result, 'Aviso enviado a los ciudadanos correctamente')
}

module.exports = { getMyNotifications, markAsRead, markAllAsRead, broadcastAlert }