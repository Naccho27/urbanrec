'use strict'

const { body, param } = require('express-validator')

const createWasteTypeRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 100 }).withMessage('El nombre no puede superar 100 caracteres'),

  body('description')
    .optional()
    .trim(),

  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('El color debe ser un hex válido (#RRGGBB)'),

  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('El ícono no puede superar 50 caracteres')
]

const updateWasteTypeRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }),

  body('description')
    .optional()
    .trim(),

  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color hex inválido (#RRGGBB)'),

  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 }),

  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active debe ser true o false')
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

module.exports = { createWasteTypeRules, updateWasteTypeRules, idParamRules }