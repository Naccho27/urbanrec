'use strict'

const { body, param } = require('express-validator')
const { ROLES }       = require('../../../shared/utils/roles')

const createUserRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 100 }).withMessage('El nombre no puede superar 100 caracteres'),

  body('email')
    .trim()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
    .matches(/[0-9]/).withMessage('Debe contener al menos un número'),

  body('role')
    .notEmpty().withMessage('El rol es requerido')
    .isIn(Object.values(ROLES)).withMessage('Rol inválido'),

  body('company_id')
    .optional()
    .isInt({ min: 1 }).withMessage('ID de empresa inválido'),

  body('phone')
    .optional()
    .trim()
    .isLength({ max: 30 }).withMessage('El teléfono no puede superar 30 caracteres'),

  body('dni')
    .optional()
    .trim()
    .isLength({ max: 15 }).withMessage('El DNI no puede superar 15 caracteres'),

  body('license_number')
    .optional()
    .trim()
    .isLength({ max: 30 }).withMessage('El número de licencia no puede superar 30 caracteres'),

  body('license_expiry')
    .optional()
    .isDate().withMessage('La fecha de vencimiento de licencia debe ser una fecha válida (DD-MM-YYYY)')
]

const updateUserRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID de usuario inválido'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('El nombre no puede superar 100 caracteres'),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),

  body('role')
    .optional()
    .isIn(Object.values(ROLES)).withMessage('Rol inválido'),

  body('phone')
    .optional()
    .trim()
    .isLength({ max: 30 }),

  body('dni')
    .optional()
    .trim()
    .isLength({ max: 15 }),

  body('license_number')
    .optional()
    .trim()
    .isLength({ max: 30 }),

  body('license_expiry')
    .optional()
    .isDate().withMessage('Fecha inválida (YYYY-MM-DD)')
]

const idParamRules = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido')
]

module.exports = { createUserRules, updateUserRules, idParamRules }