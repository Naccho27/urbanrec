'use strict'

const { Server } = require('socket.io')
const logger     = require('../shared/utils/logger')
const { client } = require('../config/env')
const authService = require('../modules/auth/services/auth.service')
const authModel   = require('../modules/auth/models/auth.model')
const { ROLES }   = require('../shared/utils/roles')

// ── Autenticación de sockets ──────────────────────────────
// Antes cualquier cliente podía unirse a cualquier room (por ejemplo
// emitir 'join:municipal' o 'join:user' con otro id) y recibir
// notificaciones, posiciones GPS e incidentes que no le correspondían.
// Es el mismo problema de IDOR que se corrigió en tracking, pero por
// WebSocket. Ahora el JWT se valida al conectar, igual que verifyJWT
// en las rutas HTTP, y cada room controla quién puede entrar.

// Lee la cookie httpOnly 'accessToken' del handshake (el navegador la
// manda sola si el cliente se conecta con withCredentials: true)
const getCookie = (header, name) => {
  if (!header) return null
  const found = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`))
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null
}

const authenticateSocket = async (socket, next) => {
  try {
    const token = getCookie(socket.handshake.headers.cookie, 'accessToken') ||
                  socket.handshake.auth?.token

    // Sin token: visitante (ciudadano sin cuenta). Puede conectarse,
    // pero no entra a ningún room privado.
    if (!token) {
      socket.data.user = null
      return next()
    }

    const decoded = authService.verifyToken(token)
    if (decoded.purpose === 'totp_pending') return next(new Error('Token inválido'))

    const user = await authModel.findById(decoded.id)
    if (!user || !user.is_active || user.deleted_at) {
      return next(new Error('Usuario no autorizado o inactivo'))
    }

    socket.data.user = { id: user.id, role: user.role, company_id: user.company_id }
    next()
  } catch {
    // Token vencido o adulterado: se rechaza la conexión
    next(new Error('Token inválido o expirado'))
  }
}

// Avisa al cliente que no puede entrar a un room
const deny = (socket, room) => {
  socket.emit('error:forbidden', { room, message: 'No tiene acceso a este canal' })
  logger.warn(`Socket ${socket.id} sin acceso a ${room} (user ${socket.data.user?.id ?? 'visitante'})`)
}

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

  // Se valida el token antes de aceptar cada conexión
  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const user = socket.data.user
    logger.info(`Socket conectado: ${socket.id} (${user ? `user ${user.id}, ${user.role}` : 'visitante'})`)

    // Cada usuario autenticado entra solo a su room personal y, si es
    // operador de empresa, al de su empresa. No hace falta que el
    // cliente lo pida: el servidor ya sabe quién es.
    if (user) {
      socket.join(`user:${user.id}`)
      if (user.role === ROLES.OPERATOR_COMPANY && user.company_id) {
        socket.join(`company:${user.company_id}`)
      }
    }

    // ── Rooms ──────────────────────────────────────────
    // El cliente se une a su room personal al conectarse
    // Permite enviar notificaciones a un usuario específico
    // Se mantiene por compatibilidad, pero solo deja entrar al propio room
    socket.on('join:user', (userId) => {
      if (!user || Number(userId) !== user.id) return deny(socket, `user:${userId}`)
      socket.join(`user:${user.id}`)
      logger.info(`Socket ${socket.id} unido a room user:${user.id}`)
    })

    // Room para seguimiento en tiempo real de un recorrido
    // Mismas reglas que GET /tracking/executions/:id (assertExecutionAccess):
    // municipal y admin ven todas, la empresa las suyas, el conductor la propia
    socket.on('join:execution', async (executionId) => {
      if (!user) return deny(socket, `execution:${executionId}`)
      try {
        // require diferido: tracking.service termina requiriendo este
        // archivo (vía socket.service → rooms) y cargarlo arriba crearía
        // una dependencia circular
        const trackingService = require('../modules/tracking/services/tracking.service')
        await trackingService.getExecutionById(executionId, user)
        socket.join(`execution:${executionId}`)
        logger.info(`Socket ${socket.id} unido a room execution:${executionId}`)
      } catch {
        deny(socket, `execution:${executionId}`)
      }
    })

    // Room global para operadores municipales
    // Reciben todas las alertas del sistema
    socket.on('join:municipal', () => {
      if (!user || ![ROLES.ADMIN, ROLES.MUNICIPAL].includes(user.role)) return deny(socket, 'municipal')
      socket.join('municipal')
      logger.info(`Socket ${socket.id} unido a room municipal`)
    })

    // Room de empresa — operador empresa ve solo sus recorridos
    socket.on('join:company', (companyId) => {
      const isSupervisor = user && [ROLES.ADMIN, ROLES.MUNICIPAL].includes(user.role)
      const isOwnCompany = user && user.role === ROLES.OPERATOR_COMPANY &&
                           Number(companyId) === user.company_id
      if (!isSupervisor && !isOwnCompany) return deny(socket, `company:${companyId}`)
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