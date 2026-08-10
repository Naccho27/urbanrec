'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../../users/middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')
const auditService  = require('../services/audit.service')
const { ok }        = require('../../../shared/utils/responses')

const router = Router()
router.use(verifyJWT)

// GET /api/v1/audit — admin ve todo, municipal ve sus operaciones
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  asyncWrapper(async (req, res) => {
    const filters = {
      user_id:    req.query.user_id    || undefined,
      company_id: req.query.company_id || undefined,
      action:     req.query.action     || undefined,
      entity:     req.query.entity     || undefined,
      from:       req.query.from       || undefined,
      to:         req.query.to         || undefined,
      limit:      parseInt(req.query.limit)  || 50,
      offset:     parseInt(req.query.offset) || 0
    }

    // Municipal solo ve sus propias acciones
    if (req.user.role === ROLES.MUNICIPAL) {
      filters.user_id = req.user.id
    }

    const result = await auditService.getAll(filters)
    return ok(res, result)
  })
)

// GET /api/v1/audit/companies/:companyId — solo admin
// Actividad completa de una empresa prestadora
router.get('/companies/:companyId',
  checkRole(ROLES.ADMIN),
  asyncWrapper(async (req, res) => {
    const filters = {
      from:   req.query.from   || undefined,
      to:     req.query.to     || undefined,
      action: req.query.action || undefined,
      limit:  parseInt(req.query.limit)  || 50,
      offset: parseInt(req.query.offset) || 0
    }
    const result = await auditService.getByCompany(
      parseInt(req.params.companyId),
      filters
    )
    return ok(res, result)
  })
)

module.exports = router