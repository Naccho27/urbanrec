'use strict'

const { body, param, query } = require('express-validator')

const createZoneRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 150 }).withMessage('El nombre no puede superar 150 caracteres'),

  body('description')
    .optional()
    .trim(),

  body('geojson')
    .notEmpty().withMessage('El GeoJSON es requerido')
    .isObject().withMessage('El GeoJSON debe ser un objeto')
    .custom((value) => {
      if (!value.type || !value.coordinates) {
        throw new Error('GeoJSON inválido: debe tener type y coordinates')
      }
      if (!['Polygon', 'MultiPolygon'].includes(value.type)) {
        throw new Error('El GeoJSON debe ser un Polygon o MultiPolygon')
      }
      return true
    }),

  body('center_lat')
    .optional()
    .isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),

  body('center_lng')
    .optional()
    .isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),

  body('waste_type_ids')
    .optional()
    .isArray().withMessage('waste_type_ids debe ser un array')
    .custom((arr) => {
      if (arr.some(id => !Number.isInteger(id) || id < 1)) {
        throw new Error('Cada waste_type_id debe ser un entero positivo')
      }
      return true
    })
]

const updateZoneRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 150 }),

  body('description')
    .optional()
    .trim(),

  body('geojson')
    .optional()
    .isObject()
    .custom((value) => {
      if (value && (!value.type || !value.coordinates)) {
        throw new Error('GeoJSON inválido')
      }
      return true
    }),

  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active debe ser true o false'),

  body('waste_type_ids')
    .optional()
    .isArray()
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

const addressQueryRules = [
  query('address')
    .trim()
    .notEmpty().withMessage('La dirección es requerida')
]

module.exports = {
  createZoneRules,
  updateZoneRules,
  idParamRules,
  addressQueryRules
}