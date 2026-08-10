'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller = require('../controllers/tracking.controller')
const {
  createExecutionRules,
  gpsPointRules,
  confirmZoneRules,
  syncQueueRules,
  idParamRules
} = require('../validators/tracking.validator')

const router = Router()
router.use(verifyJWT)

// ── Ejecuciones ───────────────────────────────────────────

// GET /api/v1/tracking/executions
router.get('/executions',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getExecutions)
)

// GET /api/v1/tracking/executions/active — mapa en tiempo real
router.get('/executions/active',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getActiveExecutions)
)

// GET /api/v1/tracking/executions/:id
router.get('/executions/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY, ROLES.CONDUCTOR),
  idParamRules,
  validate,
  asyncWrapper(controller.getExecutionById)
)

// POST /api/v1/tracking/executions — crear ejecución del día
router.post('/executions',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  createExecutionRules,
  validate,
  asyncWrapper(controller.createExecution)
)

// PATCH /api/v1/tracking/executions/:id/start — conductor inicia
router.patch('/executions/:id/start',
  checkRole(ROLES.CONDUCTOR),
  idParamRules,
  validate,
  asyncWrapper(controller.startExecution)
)

// PATCH /api/v1/tracking/executions/:id/pause
router.patch('/executions/:id/pause',
  checkRole(ROLES.CONDUCTOR),
  idParamRules,
  validate,
  asyncWrapper(controller.pauseExecution)
)

// PATCH /api/v1/tracking/executions/:id/complete
router.patch('/executions/:id/complete',
  checkRole(ROLES.CONDUCTOR),
  idParamRules,
  validate,
  asyncWrapper(controller.completeExecution)
)

// ── GPS ───────────────────────────────────────────────────

// POST /api/v1/tracking/gps — conductor envía posición
router.post('/gps',
  checkRole(ROLES.CONDUCTOR),
  gpsPointRules,
  validate,
  asyncWrapper(controller.recordGps)
)

// GET /api/v1/tracking/executions/:id/gps — historial GPS
router.get('/executions/:id/gps',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  idParamRules,
  validate,
  asyncWrapper(controller.getGpsHistory)
)

// ── Zone Visits ───────────────────────────────────────────

// GET /api/v1/tracking/executions/:id/zones
router.get('/executions/:id/zones',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY, ROLES.CONDUCTOR),
  idParamRules,
  validate,
  asyncWrapper(controller.getZoneVisits)
)

// POST /api/v1/tracking/executions/:id/zones/confirm — manual
router.post('/executions/:id/zones/confirm',
  checkRole(ROLES.CONDUCTOR),
  confirmZoneRules,
  validate,
  asyncWrapper(controller.confirmZone)
)

// ── Sync Queue ────────────────────────────────────────────

// POST /api/v1/tracking/sync — conductor sincroniza datos offline
router.post('/sync',
  checkRole(ROLES.CONDUCTOR),
  syncQueueRules,
  validate,
  asyncWrapper(controller.syncOfflineData)
)

module.exports = router