'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller = require('../controllers/incidents.controller')
const {
  createIncidentRules,
  resolveIncidentRules,
  idParamRules
} = require('../validators/incidents.validator')

const router = Router()
router.use(verifyJWT)

// GET /api/v1/incidents
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getAll)
)

// GET /api/v1/incidents/:id
router.get('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  idParamRules,
  validate,
  asyncWrapper(controller.getById)
)

// POST /api/v1/incidents — conductor reporta desde la PWA
router.post('/',
  checkRole(ROLES.CONDUCTOR),
  createIncidentRules,
  validate,
  asyncWrapper(controller.create)
)

// PATCH /api/v1/incidents/:id/resolve — municipal gestiona
router.patch('/:id/resolve',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  resolveIncidentRules,
  validate,
  asyncWrapper(controller.resolve)
)

module.exports = router