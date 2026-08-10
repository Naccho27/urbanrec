'use strict'

const userModel    = require('../models/user.model')
const companyModel = require('../models/company.model')
const authService  = require('../../auth/services/auth.service')
const { ROLES }    = require('../../../shared/utils/roles')
const auditService = require('../../audit/services/audit.service')

// Obtiene todos los usuarios según el rol del solicitante
// Admin ve todo, otros roles ven solo su scope
const getAll = async (filters) => {
  return userModel.findAll(filters)
}

// Obtiene un usuario por ID
// Lanza error si no existe
const getById = async (id) => {
  const user = await userModel.findById(id)
  if (!user) {
    const err = new Error('Usuario no encontrado')
    err.statusCode = 404
    throw err
  }
  return user
}

// Crea un usuario nuevo
// Valida duplicado de email y reglas de negocio
const create = async (data, requestingUser) => {

  // Solo el admin puede crear usuarios
  if (requestingUser.role !== ROLES.ADMIN) {
    const err = new Error('Solo el administrador puede crear usuarios')
    err.statusCode = 403
    throw err
  }

  // Verificar que el email no esté en uso
  const existing = await userModel.findByEmail(data.email)
  if (existing) {
    const err = new Error('El email ya está registrado en el sistema')
    err.statusCode = 409
    throw err
  }

  // Solo el admin puede asignar company_id
  // operator_company y conductor requieren company_id
  if ([ROLES.OPERATOR_COMPANY, ROLES.CONDUCTOR].includes(data.role)) {
    if (!data.company_id) {
      const err = new Error('Los roles conductor y operador empresa requieren una empresa asignada')
      err.statusCode = 400
      throw err
    }
    // Verificar que la empresa existe y está activa
    const company = await companyModel.findById(data.company_id)
    if (!company || !company.is_active) {
      const err = new Error('La empresa no existe o está desactivada')
      err.statusCode = 400
      throw err
    }
  }

  // admin, municipal y citizen no deben tener company_id
  if ([ROLES.ADMIN, ROLES.MUNICIPAL, ROLES.CITIZEN].includes(data.role)) {
    data.company_id = null
  }

  // Hashear contraseña
  const password_hash = await authService.hashPassword(data.password)

  const id = await userModel.create({ ...data, password_hash })

  await auditService.record({
  requestingUser,
  action:    auditService.ACTIONS.CREATE,
  entity:    auditService.ENTITIES.USER,
  entity_id: id,
  new_values: { name: data.name, email: data.email, role: data.role }
})

  return userModel.findById(id)
}

// Actualiza un usuario
// Valida que no se pueda cambiar el company_id sin ser admin
const updateUser = async (id, data, requestingUser) => {
  const user = await userModel.findById(id)
  if (!user) {
    const err = new Error('Usuario no encontrado')
    err.statusCode = 404
    throw err
  }

  // Solo el admin puede cambiar roles y empresa
  if (data.role && requestingUser.role !== ROLES.ADMIN) {
    const err = new Error('Solo el administrador puede cambiar roles')
    err.statusCode = 403
    throw err
  }

  if (data.company_id !== undefined && requestingUser.role !== ROLES.ADMIN) {
    const err = new Error('Solo el administrador puede asignar empresas')
    err.statusCode = 403
    throw err
  }

  await userModel.update(id, data)

  await auditService.record({
  requestingUser,
  action:     auditService.ACTIONS.UPDATE,
  entity:     auditService.ENTITIES.USER,
  entity_id:  parseInt(id),
  old_values: { role: user.role, company_id: user.company_id },
  new_values: data
})

  return userModel.findById(id)
}

// Desactiva un usuario (soft delete)
const deactivate = async (id, requestingUser) => {
  // No se puede desactivar a uno mismo
  if (parseInt(id) === requestingUser.id) {
    const err = new Error('No puede desactivar su propia cuenta')
    err.statusCode = 400
    throw err
  }

  const user = await userModel.findById(id)
  if (!user) {
    const err = new Error('Usuario no encontrado')
    err.statusCode = 404
    throw err
  }

  await userModel.softDelete(id)

  await auditService.record({
  requestingUser,
  action:    auditService.ACTIONS.SOFT_DELETE,
  entity:    auditService.ENTITIES.USER,
  entity_id: parseInt(id)
})

  return { message: 'Usuario desactivado correctamente' }
}

// Reactiva un usuario
const activate = async (id) => {
  const user = await userModel.findById(id)
  if (!user) {
    const err = new Error('Usuario no encontrado')
    err.statusCode = 404
    throw err
  }
  await userModel.reactivate(id)
  return userModel.findById(id)
}

module.exports = {
  getAll,
  getById,
  create,
  updateUser,
  deactivate,
  activate
}