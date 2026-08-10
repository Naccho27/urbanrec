'use strict'

const { body, param } = require('express-validator')

const createCompanyRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre de la empresa es requerido')
    .isLength({ max: 150 }).withMessage('El nombre no puede superar 150 caracteres'),

  body('cuit')
    .optional()
    .trim()
    .matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('El CUIT debe tener formato XX-XXXXXXXX-X'),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .isLength({ max: 30 }),

  body('address')
    .optional()
    .trim()
]

const updateCompanyRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 150 }),

  body('cuit')
    .optional()
    .trim()
    .matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('CUIT inválido'),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Email inválido'),

  body('phone')
    .optional()
    .trim(),

  body('address')
    .optional()
    .trim()
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

module.exports = { createCompanyRules, updateCompanyRules, idParamRules }