'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const controller = require('../controllers/schedules.controller')
const {
  createScheduleRules,
  updateScheduleRules,
  idParamRules,
  dateQueryRules
} = require('../validators/schedules.validator')

const router = Router()

router.use(verifyJWT)

// GET /api/v1/schedules
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  asyncWrapper(controller.getAll)
)

// GET /api/v1/schedules/for-date?date=YYYY-MM-DD
// El conductor lo usa para ver sus recorridos del día
router.get('/for-date',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY, ROLES.CONDUCTOR),
  dateQueryRules,
  validate,
  asyncWrapper(controller.getForDate)
)

// GET /api/v1/schedules/:id
router.get('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.OPERATOR_COMPANY),
  idParamRules,
  validate,
  asyncWrapper(controller.getById)
)

// POST /api/v1/schedules — solo admin y municipal
router.post('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  createScheduleRules,
  validate,
  asyncWrapper(controller.create)
)

// PATCH /api/v1/schedules/:id
router.patch('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  updateScheduleRules,
  validate,
  asyncWrapper(controller.update)
)

// DELETE /api/v1/schedules/:id
router.delete('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  idParamRules,
  validate,
  asyncWrapper(controller.remove)
)

module.exports = router