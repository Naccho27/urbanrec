'use strict'

const { fail }             = require('../../../shared/utils/responses')
const { ROLE_PERMISSIONS } = require('../../../shared/utils/permissions')

// Verifica que el usuario tenga el rol requerido.
// Se usa después de verifyJWT.
//
// Uso:
// router.get('/ruta', verifyJWT, checkRole('admin'), miController)
// router.get('/ruta', verifyJWT, checkRole('admin', 'municipal'), miController)

const checkRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return fail(res, 'No autenticado', 401)
  }

  if (!allowedRoles.includes(req.user.role)) {
    return fail(res, 'No tiene permisos para esta acción', 403)
  }

  next()
}

// Verifica que el usuario tenga un permiso específico.
// Más granular que checkRole — permite control fino por acción.
//
// Uso:
// router.patch('/zonas/:id', verifyJWT, checkPermission('zones:write'), miController)

const checkPermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return fail(res, 'No autenticado', 401)
  }

  const userPermissions = ROLE_PERMISSIONS[req.user.role] || []

  if (!userPermissions.includes(permission)) {
    return fail(res, 'No tiene permisos para esta acción', 403)
  }

  next()
}

// Verifica que el usuario pertenezca a la empresa
// del recurso que está intentando acceder.
// Solo aplica a operator_company y conductor.
//
// Uso:
// router.get('/recorridos', verifyJWT, filterByCompany, miController)

const filterByCompany = (req, res, next) => {
  const { ROLES } = require('../../../shared/utils/roles')

  // Admin y municipal tienen acceso global — sin filtro
  if ([ROLES.ADMIN, ROLES.MUNICIPAL].includes(req.user.role)) {
    req.companyFilter = null
    return next()
  }

  // operator_company y conductor solo ven su empresa
  if (!req.user.company_id) {
    return fail(res, 'Usuario sin empresa asignada', 403)
  }

  req.companyFilter = req.user.company_id
  next()
}

module.exports = { checkRole, checkPermission, filterByCompany }