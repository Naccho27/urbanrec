'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller  = require('../controllers/waste-types.controller')
const { createWasteTypeRules, updateWasteTypeRules, idParamRules } =
  require('../validators/waste-types.validator')

const router = Router()

// GET /api/v1/waste-types — público, ciudadanos también lo usan
// para saber qué tipos de residuo hay en su zona
router.get('/',
  asyncWrapper(controller.getAll)
)

// GET /api/v1/waste-types/:id — público
router.get('/:id',
  idParamRules,
  validate,
  asyncWrapper(controller.getById)
)

// POST /api/v1/waste-types — admin y municipal
router.post('/',
  verifyJWT,
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  createWasteTypeRules,
  validate,
  asyncWrapper(controller.create)
)

// PATCH /api/v1/waste-types/:id — admin y municipal
router.patch('/:id',
  verifyJWT,
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  updateWasteTypeRules,
  validate,
  asyncWrapper(controller.update)
)

// DELETE /api/v1/waste-types/:id — solo admin
router.delete('/:id',
  verifyJWT,
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(controller.remove)
)

module.exports = router