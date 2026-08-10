'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { body, param } = require('express-validator')
const { ROLES }     = require('../../../shared/utils/roles')
const controller    = require('../controllers/ai.controller')

const router = Router()
router.use(verifyJWT)
router.use(checkRole(ROLES.ADMIN, ROLES.MUNICIPAL))

// POST /api/v1/ai/optimize/:routeId
router.post('/optimize/:routeId',
  [param('routeId').isInt({ min: 1 }).withMessage('routeId inválido')],
  validate,
  asyncWrapper(controller.optimize)
)

// POST /api/v1/ai/predict/:zoneId
router.post('/predict/:zoneId',
  [param('zoneId').isInt({ min: 1 }).withMessage('zoneId inválido')],
  validate,
  asyncWrapper(controller.predict)
)

// GET /api/v1/ai/suggestions
router.get('/suggestions',
  asyncWrapper(controller.getSuggestions)
)

// GET /api/v1/ai/suggestions/:id
router.get('/suggestions/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  asyncWrapper(controller.getSuggestionById)
)

// PATCH /api/v1/ai/suggestions/:id/review
router.patch('/suggestions/:id/review',
  [
    param('id').isInt({ min: 1 }),
    body('status')
      .notEmpty().withMessage('El estado es requerido')
      .isIn(['approved', 'rejected']).withMessage('Debe ser approved o rejected'),
    body('review_notes').optional().trim()
  ],
  validate,
  asyncWrapper(controller.review)
)

module.exports = router