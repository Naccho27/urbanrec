'use strict'

const incidentModel  = require('../models/incident.model')
const trackingModel  = require('../../tracking/models/tracking.model')
const notifService   = require('../../notifications/services/notifications.service')
const socketService  = require('../../notifications/services/socket.service')
const { ROLES }      = require('../../../shared/utils/roles')
const { EXECUTION_STATUS } = require('../../../shared/utils/constants')
const pool           = require('../../../config/db')
const auditService = require('../../audit/services/audit.service')

const getAll = async (filters, requestingUser) => {
  // Operador empresa solo ve sus incidentes
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    filters.company_id = requestingUser.company_id
  }
  return incidentModel.findAll(filters)
}

const getById = async (id, requestingUser) => {
  const incident = await incidentModel.findById(id)
  if (!incident) {
    throw Object.assign(new Error('Incidente no encontrado'), { statusCode: 404 })
  }

  if (
    requestingUser.role === ROLES.OPERATOR_COMPANY &&
    incident.company_id !== requestingUser.company_id
  ) {
    throw Object.assign(new Error('Sin acceso'), { statusCode: 403 })
  }

  return incident
}

const create = async (data, conductorUser) => {
  // Verificar que la ejecución pertenece al conductor
  const execution = await trackingModel.findExecutionById(data.execution_id)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  if (execution.conductor_id !== conductorUser.id) {
    throw Object.assign(new Error('No es su recorrido'), { statusCode: 403 })
  }
  if (execution.status !== EXECUTION_STATUS.IN_PROGRESS) {
    throw Object.assign(
      new Error('Solo se puede reportar un incidente en un recorrido en curso'),
      { statusCode: 400 }
    )
  }

  const id = await incidentModel.create({
    execution_id: data.execution_id,
    conductor_id: conductorUser.id,
    company_id:   execution.company_id,
    zone_id:      data.zone_id      || null,
    type:         data.type,
    description:  data.description,
    latitude:     data.latitude     || null,
    longitude:    data.longitude    || null,
    photo_url:    data.photo_url    || null
  })

  const incident = await incidentModel.findById(id)

  // Actualizar la ejecución a with_issues
  await trackingModel.updateExecutionStatus(
    data.execution_id,
    EXECUTION_STATUS.WITH_ISSUES
  )

  // Notificar en tiempo real a municipal y empresa
  socketService.emitIncident(data.execution_id, execution.company_id, incident)

  // Buscar operadores municipales para notificar
  const [municipalUsers] = await pool.execute(
    "SELECT id FROM users WHERE role = 'municipal' AND is_active = TRUE"
  )
  const userIds = municipalUsers.map(u => u.id)
  await notifService.notifyIncident(userIds, incident)

  return incident
}

const resolve = async (id, { status, resolution_notes }, requestingUser) => {
  // Solo municipal y admin pueden resolver incidentes
  if (![ROLES.ADMIN, ROLES.MUNICIPAL].includes(requestingUser.role)) {
    throw Object.assign(new Error('Sin permisos para resolver incidentes'), { statusCode: 403 })
  }

  const incident = await incidentModel.findById(id)
  if (!incident) {
    throw Object.assign(new Error('Incidente no encontrado'), { statusCode: 404 })
  }
  if (incident.status === 'resolved') {
    throw Object.assign(new Error('El incidente ya fue resuelto'), { statusCode: 400 })
  }

  await incidentModel.updateStatus(id, status || 'resolved', {
    resolved_by:      requestingUser.id,
    resolution_notes: resolution_notes || null
  })

  await auditService.record({
  requestingUser,
  action:     auditService.ACTIONS.RESOLVE_INCIDENT,
  entity:     auditService.ENTITIES.INCIDENT,
  entity_id:  parseInt(id),
  old_values: { status: incident.status },
  new_values: { status, resolution_notes }
})

  return incidentModel.findById(id)
}

module.exports = { getAll, getById, create, resolve }