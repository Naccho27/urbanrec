'use strict'

const auditModel = require('../models/audit.model')
const logger     = require('../../../shared/utils/logger')

// Acciones auditables — constantes para evitar strings sueltos
const ACTIONS = Object.freeze({
  CREATE:           'CREATE',
  UPDATE:           'UPDATE',
  DELETE:           'DELETE',
  SOFT_DELETE:      'SOFT_DELETE',
  REACTIVATE:       'REACTIVATE',
  LOGIN:            'LOGIN',
  LOGOUT:           'LOGOUT',
  LOGIN_FAILED:     'LOGIN_FAILED',
  TOTP_ENABLED:     'TOTP_ENABLED',
  TOTP_DISABLED:    'TOTP_DISABLED',
  ROLE_CHANGED:     'ROLE_CHANGED',
  COMPANY_ASSIGNED: 'COMPANY_ASSIGNED',
  APPROVE_AI:       'APPROVE_AI',
  REJECT_AI:        'REJECT_AI',
  RESOLVE_INCIDENT: 'RESOLVE_INCIDENT',
  BROADCAST_ALERT:  'BROADCAST_ALERT',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  EXPORT:           'EXPORT'
})

// Entidades auditables
const ENTITIES = Object.freeze({
  USER:             'user',
  COMPANY:          'company',
  ZONE:             'zone',
  COLLECTION_ROUTE: 'collection_route',
  SCHEDULE:         'schedule',
  EXECUTION:        'route_execution',
  INCIDENT:         'incident',
  AI_SUGGESTION:    'ai_suggestion',
  SETTINGS:         'system_settings',
  NOTIFICATION:     'notification'
})

// Función principal — registra la acción sin interrumpir el flujo
// Los errores de auditoría nunca deben cortar una operación real
const record = async ({
  requestingUser,
  action,
  entity,
  entity_id    = null,
  old_values   = null,
  new_values   = null,
  ip_address   = null,
  user_agent   = null
}) => {
  try {
    await auditModel.log({
      user_id:    requestingUser?.id    || null,
      role:       requestingUser?.role  || null,
      company_id: requestingUser?.company_id || null,
      action,
      entity,
      entity_id,
      old_values,
      new_values,
      ip_address,
      user_agent
    })
  } catch (err) {
    // Loggear pero nunca propagar — la auditoría no debe romper nada
    logger.error(`Audit record error: ${err.message}`)
  }
}

// Helper para extraer IP y user-agent del request de Express
const fromRequest = (req) => ({
  ip_address: req.ip || req.headers['x-forwarded-for'] || null,
  user_agent: req.headers['user-agent'] || null
})

const getAll = async (filters) => {
  const [logs, total] = await Promise.all([
    auditModel.findAll(filters),
    auditModel.countAll(filters)
  ])
  return { logs, total }
}

const getByCompany = async (company_id, filters = {}) => {
  return getAll({ ...filters, company_id })
}

module.exports = {
  record,
  fromRequest,
  getAll,
  getByCompany,
  ACTIONS,
  ENTITIES
}