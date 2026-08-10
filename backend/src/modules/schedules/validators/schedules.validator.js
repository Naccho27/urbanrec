'use strict'

const { body, param, query } = require('express-validator')
const { SHIFT } = require('../../../shared/utils/constants')

const createScheduleRules = [
  body('collection_route_id')
    .notEmpty().withMessage('El recorrido es requerido')
    .isInt({ min: 1 }).withMessage('collection_route_id inválido'),

  body('company_id')
    .optional()
    .isInt({ min: 1 }).withMessage('company_id inválido'),

  body('shift')
    .notEmpty().withMessage('El turno es requerido')
    .isIn(Object.values(SHIFT))
    .withMessage(`El turno debe ser: ${Object.values(SHIFT).join(', ')}`),

  body('week_days')
    .notEmpty().withMessage('Los días de la semana son requeridos')
    .isArray({ min: 1 }).withMessage('week_days debe ser un array con al menos un día')
    .custom((arr) => {
      if (arr.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
        throw new Error('Cada día debe ser un número entre 1 (lunes) y 7 (domingo)')
      }
      return true
    }),

  body('start_time')
    .notEmpty().withMessage('La hora de inicio es requerida')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora debe tener formato HH:MM'),

  body('end_time')
    .notEmpty().withMessage('La hora de fin es requerida')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('La hora debe tener formato HH:MM'),

  body('valid_from')
    .notEmpty().withMessage('La fecha de inicio es requerida')
    .isDate().withMessage('valid_from debe ser una fecha válida (YYYY-MM-DD)'),

  body('valid_until')
    .optional()
    .isDate().withMessage('valid_until debe ser una fecha válida (YYYY-MM-DD)')
]

const updateScheduleRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('shift')
    .optional()
    .isIn(Object.values(SHIFT))
    .withMessage(`El turno debe ser: ${Object.values(SHIFT).join(', ')}`),

  body('week_days')
    .optional()
    .isArray({ min: 1 })
    .custom((arr) => {
      if (arr.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
        throw new Error('Cada día debe ser entre 1 y 7')
      }
      return true
    }),

  body('start_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Formato HH:MM'),

  body('end_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Formato HH:MM'),

  body('valid_from')
    .optional()
    .isDate(),

  body('valid_until')
    .optional()
    .isDate(),

  body('is_active')
    .optional()
    .isBoolean()
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

const dateQueryRules = [
  query('date')
    .optional()
    .isDate().withMessage('La fecha debe tener formato YYYY-MM-DD')
]

module.exports = {
  createScheduleRules,
  updateScheduleRules,
  idParamRules,
  dateQueryRules
}