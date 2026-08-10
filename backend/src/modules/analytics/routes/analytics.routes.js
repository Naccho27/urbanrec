'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')
const controller    = require('../controllers/analytics.controller')

const router = Router()
router.use(verifyJWT)

// Todos los endpoints son GET — solo lectura, sin validators complejos

// GET /api/v1/analytics/dashboard
// Resumen ejecutivo del día y del mes
router.get('/dashboard',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getDashboard)
)

// GET /api/v1/analytics/executions?from=2026-07-01&to=2026-07-31
router.get('/executions',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getExecutionsSummary)
)

// GET /api/v1/analytics/routes?from=...&to=...
router.get('/routes',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getRouteMetrics)
)

// GET /api/v1/analytics/incidents?from=...&to=...
router.get('/incidents',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getIncidentStats)
)

// GET /api/v1/analytics/coverage
// Cobertura real de recolección por zona
router.get('/coverage',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getZoneCoverage)
)

// GET /api/v1/analytics/conductors
router.get('/conductors',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getConductorMetrics)
)

module.exports = router