'use strict'

const { body, param } = require('express-validator')
const { INCIDENT_TYPES, INCIDENT_STATUS } = require('../../../shared/utils/constants')

const createIncidentRules = [
  body('execution_id')
    .notEmpty().withMessage('execution_id requerido')
    .isInt({ min: 1 }),

  body('type')
    .notEmpty().withMessage('El tipo de incidente es requerido')
    .isIn(Object.values(INCIDENT_TYPES))
    .withMessage(`Tipo inválido. Debe ser: ${Object.values(INCIDENT_TYPES).join(', ')}`),

  body('description')
    .trim()
    .notEmpty().withMessage('La descripción es requerida')
    .isLength({ max: 1000 }).withMessage('Máximo 1000 caracteres'),

  body('zone_id')
    .optional()
    .isInt({ min: 1 }),

  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 }),

  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 }),

  body('photo_url')
    .optional()
    .trim()
    .isURL().withMessage('La URL de la foto no es válida')
]

const resolveIncidentRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('status')
    .optional()
    .isIn(['reviewing', 'resolved'])
    .withMessage('Estado inválido. Debe ser: reviewing o resolved'),

  body('resolution_notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
]

const idParamRules = [
  param('id').isInt({ min: 1 }).withMessage('ID inválido')
]

module.exports = { createIncidentRules, resolveIncidentRules, idParamRules }