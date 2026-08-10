'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller = require('../controllers/zones.controller')
const {
  createZoneRules,
  updateZoneRules,
  idParamRules,
  addressQueryRules
} = require('../validators/zones.validator')

const router = Router()

// ── Rutas públicas — sin autenticación ───────────────────

// GET /api/v1/zones — mapa público para ciudadanos
router.get('/',
  asyncWrapper(controller.getAll)
)

// GET /api/v1/zones/search?address=... — búsqueda por dirección
router.get('/search',
  addressQueryRules,
  validate,
  asyncWrapper(controller.findByAddress)
)

// GET /api/v1/zones/:id — detalle de una zona
router.get('/:id',
  idParamRules,
  validate,
  asyncWrapper(controller.getById)
)

// ── Rutas privadas — requieren JWT ────────────────────────

// POST /api/v1/zones — admin y municipal crean zonas
router.post('/',
  verifyJWT,
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  createZoneRules,
  validate,
  asyncWrapper(controller.create)
)

// PATCH /api/v1/zones/:id
router.patch('/:id',
  verifyJWT,
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  updateZoneRules,
  validate,
  asyncWrapper(controller.update)
)

// DELETE /api/v1/zones/:id — soft delete
router.delete('/:id',
  verifyJWT,
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  idParamRules,
  validate,
  asyncWrapper(controller.remove)
)

module.exports = router