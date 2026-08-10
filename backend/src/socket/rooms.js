'use strict'

const { getIO } = require('./index')

// Emite un evento a un usuario específico
const emitToUser = (userId, event, data) => {
  getIO().to(`user:${userId}`).emit(event, data)
}

// Emite a todos los operadores municipales
const emitToMunicipal = (event, data) => {
  getIO().to('municipal').emit(event, data)
}

// Emite a todos los usuarios de una empresa
const emitToCompany = (companyId, event, data) => {
  getIO().to(`company:${companyId}`).emit(event, data)
}

// Emite a todos los que siguen una ejecución específica
const emitToExecution = (executionId, event, data) => {
  getIO().to(`execution:${executionId}`).emit(event, data)
}

// Emite a todos los conectados (ciudadanos incluidos)
const emitToAll = (event, data) => {
  getIO().emit(event, data)
}

module.exports = {
  emitToUser,
  emitToMunicipal,
  emitToCompany,
  emitToExecution,
  emitToAll
}