'use strict'

const { body } = require('express-validator')

// Reglas para POST /auth/login
const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
]

// Reglas para POST /auth/2fa/verify (durante el login)
const verifyTOTPLoginRules = [
  body('userId')
    .notEmpty().withMessage('El ID de usuario es requerido')
    .isInt({ min: 1 }).withMessage('ID inválido'),

  body('token')
    .notEmpty().withMessage('El código TOTP es requerido')
    .isLength({ min: 6, max: 6 }).withMessage('El código debe tener exactamente 6 dígitos')
    .isNumeric().withMessage('El código debe ser numérico')
]

// Reglas para POST /auth/2fa/enable
const enableTOTPRules = [
  body('token')
    .notEmpty().withMessage('El código TOTP es requerido')
    .isLength({ min: 6, max: 6 }).withMessage('El código debe tener exactamente 6 dígitos')
    .isNumeric().withMessage('El código debe ser numérico')
]

// Reglas para POST /auth/2fa/disable
const disableTOTPRules = [
  body('token')
    .notEmpty().withMessage('El código TOTP es requerido')
    .isLength({ min: 6, max: 6 }).withMessage('El código debe tener exactamente 6 dígitos')
    .isNumeric().withMessage('El código debe ser numérico'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
]

// Reglas para POST /auth/refresh
const refreshTokenRules = [
  body('refreshToken')
    .notEmpty().withMessage('El refresh token es requerido')
]

module.exports = {
  loginRules,
  verifyTOTPLoginRules,
  enableTOTPRules,
  disableTOTPRules,
  refreshTokenRules
}