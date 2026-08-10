'use strict'

const rooms = require('../../../socket/rooms')

// Emite una notificación in-app en tiempo real
// Se usa desde notifications.service después de guardar en DB
const emitNotification = (userId, notification) => {
  rooms.emitToUser(userId, 'notification:new', notification)
}

// Broadcast de posición GPS a municipal y empresa
const emitGpsUpdate = (executionId, companyId, position) => {
  rooms.emitToExecution(executionId, 'gps:update', position)
  rooms.emitToMunicipal('gps:update', { executionId, ...position })
  rooms.emitToCompany(companyId, 'gps:update', { executionId, ...position })
}

// Alerta de incidente a municipal y empresa
const emitIncident = (executionId, companyId, incident) => {
  rooms.emitToMunicipal('incident:new', incident)
  rooms.emitToCompany(companyId, 'incident:new', incident)
  rooms.emitToExecution(executionId, 'incident:new', incident)
}

// Cambio de estado de ejecución
const emitExecutionStatus = (executionId, companyId, status) => {
  rooms.emitToMunicipal('execution:status', { executionId, status })
  rooms.emitToCompany(companyId, 'execution:status', { executionId, status })
  rooms.emitToExecution(executionId, 'execution:status', { executionId, status })
}

module.exports = {
  emitNotification,
  emitGpsUpdate,
  emitIncident,
  emitExecutionStatus
}