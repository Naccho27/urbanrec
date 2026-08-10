'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')
const controller    = require('../controllers/export.controller')

const router = Router()
router.use(verifyJWT)

// GET /api/v1/export/executions?format=csv&from=2026-07-01&to=2026-07-31
router.get('/executions',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.exportExecutions)
)

// GET /api/v1/export/incidents?format=pdf&from=...&to=...
router.get('/incidents',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.exportIncidents)
)

// GET /api/v1/export/compliance?format=pdf
// Solo municipal y admin — reporte de cumplimiento por empresa
router.get('/compliance',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  asyncWrapper(controller.exportComplianceReport)
)

module.exports = router