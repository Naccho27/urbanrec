'use strict'

const http           = require('http')
const { server }     = require('./config/env')
const app            = require('./app')
const socketManager  = require('./socket/index')
const alertsService  = require('./modules/notifications/services/alerts.service')

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

  // Alertas automáticas por reglas de negocio (demoras, GPS, licencias…)
  // Se inician después de levantar Socket.IO porque avisan en tiempo real
  alertsService.startScheduler()
  console.log(`⏰ Alertas automáticas activas`)
})