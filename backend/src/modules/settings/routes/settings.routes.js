'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')
const controller    = require('../controllers/settings.controller')

const router = Router()
router.use(verifyJWT)

// GET /api/v1/settings — admin y municipal pueden ver los parámetros
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  asyncWrapper(controller.getAll)
)

// PATCH /api/v1/settings/:key — solo admin puede modificar
router.patch('/:key',
  checkRole(ROLES.ADMIN),
  asyncWrapper(controller.update)
)

module.exports = router