'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller = require('../controllers/collection-routes.controller')
const {
  createRouteRules,
  updateRouteRules,
  assignCompanyRules,
  idParamRules
} = require('../validators/collection-routes.validator')

const router = Router()

// Todas las rutas requieren JWT
router.use(verifyJWT)

// GET /api/v1/collection-routes
// Municipal y admin ven todos — operador empresa ve solo los suyos
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getAll)
)

// GET /api/v1/collection-routes/:id
router.get('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  idParamRules,
  validate,
  asyncWrapper(controller.getById)
)

// POST /api/v1/collection-routes — solo admin y municipal
router.post('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  createRouteRules,
  validate,
  asyncWrapper(controller.create)
)

// PATCH /api/v1/collection-routes/:id
router.patch('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  updateRouteRules,
  validate,
  asyncWrapper(controller.update)
)

// PATCH /api/v1/collection-routes/:id/assign-company
// Asignar empresa prestadora a un recorrido
router.patch('/:id/assign-company',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  assignCompanyRules,
  validate,
  asyncWrapper(controller.assignCompany)
)

// DELETE /api/v1/collection-routes/:id
router.delete('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  idParamRules,
  validate,
  asyncWrapper(controller.remove)
)

module.exports = router