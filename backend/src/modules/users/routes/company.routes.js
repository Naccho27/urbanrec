'use strict'

const { Router }    = require('express')
const asyncWrapper  = require('../../../shared/middlewares/asyncWrapper')
const validate      = require('../../../shared/middlewares/validate.middleware')
const { verifyJWT } = require('../../auth/middlewares/auth.middleware')
const { checkRole } = require('../middlewares/roles.middleware')
const { ROLES }     = require('../../../shared/utils/roles')

const companyController = require('../controllers/company.controller')
const { createCompanyRules, updateCompanyRules, idParamRules } = require('../validators/company.validator')

const router = Router()

router.use(verifyJWT)

// GET /api/v1/companies
router.get('/',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  asyncWrapper(companyController.getAll)
)

// GET /api/v1/companies/:id
router.get('/:id',
  checkRole(ROLES.ADMIN, ROLES.MUNICIPAL),
  idParamRules,
  validate,
  asyncWrapper(companyController.getById)
)

// POST /api/v1/companies — solo admin
router.post('/',
  checkRole(ROLES.ADMIN),
  createCompanyRules,
  validate,
  asyncWrapper(companyController.create)
)

// PATCH /api/v1/companies/:id
router.patch('/:id',
  checkRole(ROLES.ADMIN),
  updateCompanyRules,
  validate,
  asyncWrapper(companyController.update)
)

// DELETE /api/v1/companies/:id — desactiva empresa y sus usuarios
router.delete('/:id',
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(companyController.deactivate)
)

// PATCH /api/v1/companies/:id/reactivate
router.patch('/:id/reactivate',
  checkRole(ROLES.ADMIN),
  idParamRules,
  validate,
  asyncWrapper(companyController.reactivate)
)

module.exports = router