'use strict'

const { body, param } = require('express-validator')

const createRouteRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 150 }).withMessage('Máximo 150 caracteres'),

  body('description')
    .optional()
    .trim(),

  body('zone_id')
    .notEmpty().withMessage('La zona es requerida')
    .isInt({ min: 1 }).withMessage('zone_id inválido'),

  body('waste_type_id')
    .notEmpty().withMessage('El tipo de residuo es requerido')
    .isInt({ min: 1 }).withMessage('waste_type_id inválido'),

  body('company_id')
    .optional()
    .isInt({ min: 1 }).withMessage('company_id inválido'),

  body('geojson')
    .notEmpty().withMessage('El GeoJSON es requerido')
    .isObject().withMessage('El GeoJSON debe ser un objeto')
    .custom((value) => {
      if (!value.type || !value.coordinates) {
        throw new Error('GeoJSON inválido: falta type o coordinates')
      }
      if (!['LineString', 'MultiLineString'].includes(value.type)) {
        throw new Error('El trazado debe ser LineString o MultiLineString')
      }
      return true
    }),

  body('distance_km')
    .optional()
    .isFloat({ min: 0 }).withMessage('La distancia debe ser un número positivo'),

  body('duration_min')
    .optional()
    .isInt({ min: 1 }).withMessage('La duración debe ser un entero positivo en minutos')
]

const updateRouteRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 150 }),

  body('description')
    .optional()
    .trim(),

  body('zone_id')
    .optional()
    .isInt({ min: 1 }),

  body('waste_type_id')
    .optional()
    .isInt({ min: 1 }),

  body('geojson')
    .optional()
    .isObject()
    .custom((value) => {
      if (value && (!value.type || !value.coordinates)) {
        throw new Error('GeoJSON inválido')
      }
      return true
    }),

  body('distance_km')
    .optional()
    .isFloat({ min: 0 }),

  body('duration_min')
    .optional()
    .isInt({ min: 1 }),

  body('is_active')
    .optional()
    .isBoolean()
]

const assignCompanyRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('company_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('company_id inválido')
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

module.exports = {
  createRouteRules,
  updateRouteRules,
  assignCompanyRules,
  idParamRules
}