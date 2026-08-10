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

  body('zones_total')
    .optional()
    .isInt({ min: 0 })
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

module.exports = {
  createExecutionRules,
  gpsPointRules,
  confirmZoneRules,
  syncQueueRules,
  idParamRules
}