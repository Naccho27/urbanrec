'use strict'

const { Router } = require('express')
const asyncWrapper = require('../../../shared/middlewares/asyncWrapper')
const validate     = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../middlewares/auth.middleware')
const { body } = require('express-validator')
const { authLimiter } = require('../../../shared/middlewares/rateLimit.middleware')


const authController = require('../controllers/auth.controller')
const {
  loginRules,
  verifyTOTPLoginRules,
  enableTOTPRules,
  disableTOTPRules,
  refreshTokenRules
} = require('../validators/auth.validator')

const router = Router()

// ── Rutas públicas — sin autenticación ───────────────────
// Correcto — limitar primero, validar después
// POST /api/v1/auth/login
router.post('/login',
  authLimiter,   // ← primero
  loginRules,
  validate,
  asyncWrapper(authController.login)
)

// POST /api/v1/auth/2fa/verify  (paso 2 del login con TOTP)
router.post('/2fa/verify-login',
  authLimiter,
  verifyTOTPLoginRules,
  validate,
  asyncWrapper(authController.verifyTOTPLogin)
)

// POST /api/v1/auth/2fa/initial-setup
// Solo para el primer setup del admin — no requiere JWT
// Requiere email + password válidos para autenticarse
router.post('/2fa/initial-setup',
  authLimiter,
  loginRules,
  validate,
  asyncWrapper(authController.initialSetupTOTP)
)

// POST /api/v1/auth/2fa/initial-enable
router.post('/2fa/initial-enable',
  authLimiter,
  [
    ...loginRules,
    body('token')
      .notEmpty().withMessage('El código TOTP es requerido')
      .isLength({ min: 6, max: 6 }).withMessage('Debe tener 6 dígitos')
      .isNumeric().withMessage('Solo números')
  ],
  validate,
  asyncWrapper(authController.initialEnableTOTP)
)

// POST /api/v1/auth/refresh
router.post('/refresh',
  refreshTokenRules,
  validate,
  asyncWrapper(authController.refreshToken)
)

// ── Rutas privadas — requieren JWT ────────────────────────
// POST /api/v1/auth/2fa/setup  (genera QR)
router.post('/2fa/setup',
  verifyJWT,
  asyncWrapper(authController.setupTOTP)
)

// POST /api/v1/auth/2fa/enable  (activa TOTP con primer código)
router.post('/2fa/enable',
  verifyJWT,
  enableTOTPRules,
  validate,
  asyncWrapper(authController.enableTOTP)
)

// POST /api/v1/auth/2fa/disable  (desactiva TOTP)
router.post('/2fa/disable',
  verifyJWT,
  disableTOTPRules,
  validate,
  asyncWrapper(authController.disableTOTP)
)

// POST /api/v1/auth/logout
router.post('/logout',
  verifyJWT,
  asyncWrapper(authController.logout)
)

module.exports = router