'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const usersController               = require('../controllers/users.controller')
const { createUserRules, updateUserRules, idParamRules } = require('../validators/users.validator')

const router = Router()

// Todas las rutas requieren JWT
router.use(verifyJWT)

// GET /api/v1/users — solo admin ve todos
router.get('/',
  checkRole(ROLES.ADMIN),
  asyncWrapper(usersController.getAll)
)

// GET /api/v1/users/:id
router.get('/:id',
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(usersController.getById)
)

// POST /api/v1/users — solo admin crea usuarios
router.post('/',
  checkRole(ROLES.ADMIN),
  createUserRules,
  validate,
  asyncWrapper(usersController.create)
)

// PATCH /api/v1/users/:id
router.patch('/:id',
  checkRole(ROLES.ADMIN),
  updateUserRules,
  validate,
  asyncWrapper(usersController.update)
)

// DELETE /api/v1/users/:id — soft delete
router.delete('/:id',
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(usersController.deactivate)
)

// PATCH /api/v1/users/:id/activate — reactivar cuenta
router.patch('/:id/activate',
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(usersController.activate)
)

module.exports = router