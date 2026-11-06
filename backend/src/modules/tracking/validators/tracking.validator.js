'use strict'

const { body, param, query } = require('express-validator')
const { EXECUTION_STATUS }   = require('../../../shared/utils/constants')

const createExecutionRules = [
  body('schedule_id')
    .notEmpty().withMessage('El cronograma es requerido')
    .isInt({ min: 1 }).withMessage('schedule_id inválido'),

  body('conductor_id')
    .optional()
    .isInt({ min: 1 }).withMessage('conductor_id inválido'),

  body('execution_date')
    .optional()
    .isDate().withMessage('Fecha inválida (YYYY-MM-DD)'),

]

const gpsPointRules = [
  body('execution_id')
    .notEmpty().withMessage('execution_id requerido')
    .isInt({ min: 1 }),

  body('latitude')
    .notEmpty().withMessage('latitude requerida')
    .isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),

  body('longitude')
    .notEmpty().withMessage('longitude requerida')
    .isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),

  body('accuracy_meters')
    .optional()
    .isFloat({ min: 0 }),

  body('speed_kmh')
    .optional()
    .isFloat({ min: 0 }),

  body('heading')
    .optional()
    .isFloat({ min: 0, max: 360 })
]

const confirmZoneRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('execution_id inválido'),

  body('zone_id')
    .notEmpty().withMessage('zone_id requerido')
    .isInt({ min: 1 }),

  body('notes')
    .optional()
    .trim()
]

const syncQueueRules = [
  body('execution_id')
    .notEmpty().withMessage('execution_id requerido')
    .isInt({ min: 1 }),

  body('gps_points')
    .optional()
    .isArray(),

  body('zone_visits')
    .optional()
    .isArray()
]

const idParamRules = [
  param('id').isInt({ min: 1 }).withMessage('ID inválido')
]

// Verifica que el usuario tenga acceso a una ejecución concreta.
// Admin y municipal tienen acceso global.
// El operador empresa solo accede a ejecuciones de su propia empresa.
// El conductor solo accede a las ejecuciones que tiene asignadas.
//
// Sin esta verificación, cualquier operador podía pedir una ejecución
// por ID y recibir datos de otra empresa prestadora (IDOR).
const assertExecutionAccess = (execution, requestingUser) => {
  if ([ROLES.ADMIN, ROLES.MUNICIPAL].includes(requestingUser.role)) return

  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    if (execution.company_id !== requestingUser.company_id) {
      throw Object.assign(
        new Error('No tiene acceso a esta ejecución'),
        { statusCode: 403 }
      )
    }
    return
  }

  if (requestingUser.role === ROLES.CONDUCTOR) {
    if (execution.conductor_id !== requestingUser.id) {
      throw Object.assign(
        new Error('No tiene acceso a esta ejecución'),
        { statusCode: 403 }
      )
    }
    return
  }

  throw Object.assign(new Error('Sin permisos'), { statusCode: 403 })
}

// Listado de ejecuciones con el filtro de empresa forzado por rol.
// El company_id del query param se ignora para operador empresa y
// conductor: el filtro lo impone el servidor, no el cliente.
const getExecutions = async (filters, requestingUser) => {
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    filters.company_id = requestingUser.company_id
  }
  if (requestingUser.role === ROLES.CONDUCTOR) {
    filters.company_id   = requestingUser.company_id
    filters.conductor_id = requestingUser.id
  }
  return trackingModel.findExecutions(filters)
}

// Detalle de una ejecución, validando acceso por rol
const getExecutionById = async (id, requestingUser) => {
  const execution = await trackingModel.findExecutionById(id)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return execution
}

// Historial GPS de una ejecución, validando acceso por rol
const getGpsHistory = async (executionId, requestingUser) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return trackingModel.getGpsHistory(executionId)
}

// Zonas visitadas en una ejecución, validando acceso por rol
const getZoneVisits = async (executionId, requestingUser) => {
  const execution = await trackingModel.findExecutionById(executionId)
  if (!execution) {
    throw Object.assign(new Error('Ejecución no encontrada'), { statusCode: 404 })
  }
  assertExecutionAccess(execution, requestingUser)
  return trackingModel.findZoneVisits(executionId)
}

module.exports = {
  createExecutionRules,
  gpsPointRules,
  confirmZoneRules,
  syncQueueRules,
  idParamRules
}