'use strict'

const { Server } = require('socket.io')
const logger     = require('../shared/utils/logger')
const { client } = require('../config/env')

let io

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      client.url,
      credentials: true
    },
    // Tiempo en ms que espera antes de desconectar un cliente inactivo
    pingTimeout:  60000,
    pingInterval: 25000
  })

  io.on('connection', (socket) => {
    logger.info(`Socket conectado: ${socket.id}`)

    // ── Rooms ──────────────────────────────────────────
    // El cliente se une a su room personal al conectarse
    // Permite enviar notificaciones a un usuario específico
    socket.on('join:user', (userId) => {
      socket.join(`user:${userId}`)
      logger.info(`Socket ${socket.id} unido a room user:${userId}`)
    })

    // Room para seguimiento en tiempo real de un recorrido
    socket.on('join:execution', (executionId) => {
      socket.join(`execution:${executionId}`)
      logger.info(`Socket ${socket.id} unido a room execution:${executionId}`)
    })

    // Room global para operadores municipales
    // Reciben todas las alertas del sistema
    socket.on('join:municipal', () => {
      socket.join('municipal')
      logger.info(`Socket ${socket.id} unido a room municipal`)
    })

    // Room de empresa — operador empresa ve solo sus recorridos
    socket.on('join:company', (companyId) => {
      socket.join(`company:${companyId}`)
      logger.info(`Socket ${socket.id} unido a room company:${companyId}`)
    })

    socket.on('disconnect', () => {
      logger.info(`Socket desconectado: ${socket.id}`)
    })
  })

  logger.info('✅ Socket.IO inicializado')
  return io
}

// Retorna la instancia de io para usarla en los services
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO no está inicializado. Llamá a init() primero.')
  }
  return io
}

module.exports = { init, getIO }