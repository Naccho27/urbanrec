'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { body }      = require('express-validator')
const { ROLES }     = require('../../../shared/utils/roles')
const controller    = require('../controllers/notifications.controller')

const router = Router()

router.use(verifyJWT)

// GET /api/v1/notifications
router.get('/',
  asyncWrapper(controller.getMyNotifications)
)

// PATCH /api/v1/notifications/read-all
// Antes de /:id para que no lo tome como parámetro
router.patch('/read-all',
  asyncWrapper(controller.markAllAsRead)
)

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read',
  asyncWrapper(controller.markAsRead)
)

// POST /api/v1/notifications/broadcast — solo municipal y admin
// Envía un aviso público a ciudadanos de una zona
router.post('/broadcast',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  [
    body('title')
      .trim()
      .notEmpty().withMessage('El título es requerido')
      .isLength({ max: 200 }),
    body('body')
      .trim()
      .notEmpty().withMessage('El contenido es requerido'),
    body('zone_id')
      .optional()
      .isInt({ min: 1 }).withMessage('zone_id inválido')
  ],
  validate,
  asyncWrapper(controller.broadcastAlert)
)

module.exports = router