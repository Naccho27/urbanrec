'use strict'

const http           = require('http')
const { server }     = require('./config/env')
const app            = require('./app')
const socketManager  = require('./socket/index')

// Crear servidor HTTP a partir de la app Express
// Socket.IO necesita el httpServer, no la app directamente
const httpServer = http.createServer(app)

// Inicializar Socket.IO sobre el mismo servidor HTTP
socketManager.init(httpServer)

// Iniciar servidor
httpServer.listen(server.port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${server.port}`)
  console.log(`📦 Entorno: ${server.env}`)
  console.log(`🔌 Socket.IO activo`)
})