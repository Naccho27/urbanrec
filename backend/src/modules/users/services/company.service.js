'use strict'

const companyModel = require('../models/company.model')
const auditService = require('../../audit/services/audit.service')

const getAll = async (filters) => {
  return companyModel.findAll(filters)
}

const getById = async (id) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  return company
}

const create = async (data, requestingUser) => {
  // Verificar nombre duplicado
  const existing = await companyModel.findByName(data.name)
  if (existing) {
    const err = new Error('Ya existe una empresa con ese nombre')
    err.statusCode = 409
    throw err
  }
  const id = await companyModel.create(data)

  await auditService.record({
    requestingUser,
    action:     auditService.ACTIONS.CREATE,
    entity:     auditService.ENTITIES.COMPANY,
    entity_id:  id,
    new_values: data
  })

  return companyModel.findById(id)
}

const update = async (id, data, requestingUser) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.update(id, data)

  await auditService.record({
    requestingUser,
    action:     auditService.ACTIONS.UPDATE,
    entity:     auditService.ENTITIES.COMPANY,
    entity_id:  parseInt(id),
    old_values: Object.fromEntries(Object.keys(data).map(k => [k, company[k]])),
    new_values: data
  })

  return companyModel.findById(id)
}

const deactivate = async (id, requestingUser) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.deactivate(id)

  // Desactivar una empresa desactiva también a todos sus usuarios
  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.SOFT_DELETE,
    entity:    auditService.ENTITIES.COMPANY,
    entity_id: parseInt(id)
  })

  return { message: 'Empresa y sus usuarios desactivados correctamente' }
}

const reactivate = async (id, requestingUser) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.reactivate(id)

  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.REACTIVATE,
    entity:    auditService.ENTITIES.COMPANY,
    entity_id: parseInt(id)
  })

  return companyModel.findById(id)
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  deactivate,
  reactivate
}