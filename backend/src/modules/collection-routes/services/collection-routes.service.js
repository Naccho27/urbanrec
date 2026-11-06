'use strict'

const routeModel    = require('../models/collection-route.model')
const zoneModel     = require('../../zones/models/zone.model')
const companyModel  = require('../../users/models/company.model')
const { ROLES }     = require('../../../shared/utils/roles')
const auditService = require('../../audit/services/audit.service')

const getAll = async (filters, requestingUser) => {
  // Operador empresa solo ve sus propios recorridos
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    return routeModel.findByCompany(requestingUser.company_id, filters)
  }
  return routeModel.findAll(filters)
}

const getById = async (id, requestingUser) => {
  const route = await routeModel.findById(id)
  if (!route) {
    const err = new Error('Recorrido no encontrado')
    err.statusCode = 404
    throw err
  }

  // Operador empresa solo puede ver sus propios recorridos
  if (
    requestingUser.role === ROLES.OPERATOR_COMPANY &&
    route.company_id !== requestingUser.company_id
  ) {
    const err = new Error('No tiene acceso a este recorrido')
    err.statusCode = 403
    throw err
  }

  return route
}

const create = async (data, requestingUser) => {
  // Verificar que las zonas existen y están activas
  if (!data.zone_ids || data.zone_ids.length === 0) {
    const err = new Error('El recorrido debe cubrir al menos una zona')
    err.statusCode = 400
    throw err
  }

  for (const zId of data.zone_ids) {
    const zone = await zoneModel.findById(zId)
    if (!zone || !zone.is_active) {
      const err = new Error(`La zona con ID ${zId} no existe o está inactiva`)
      err.statusCode = 400
      throw err
    }
  }

  // Si viene company_id verificar que la empresa existe
  if (data.company_id) {
    const company = await companyModel.findById(data.company_id)
    if (!company || !company.is_active) {
      const err = new Error('La empresa no existe o está inactiva')
      err.statusCode = 400
      throw err
    }
  }

  const id = await routeModel.create({
    ...data,
    created_by: requestingUser.id
  })

  // El orden del array define el orden de visita de las zonas
  await routeModel.setZones(id, data.zone_ids)

  return routeModel.findById(id)
}

const update = async (id, data, requestingUser) => {
  const route = await routeModel.findById(id)
  if (!route) {
    const err = new Error('Recorrido no encontrado')
    err.statusCode = 404
    throw err
  }

  // Operador empresa no puede modificar recorridos
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    const err = new Error('El operador de empresa no puede modificar recorridos')
    err.statusCode = 403
    throw err
  }

  await routeModel.update(id, data)

  // Actualizar zonas si vienen — el orden del array es el orden de visita
  if (data.zone_ids !== undefined) {
    if (data.zone_ids.length === 0) {
      const err = new Error('El recorrido debe cubrir al menos una zona')
      err.statusCode = 400
      throw err
    }
    await routeModel.setZones(id, data.zone_ids)
  }

  return routeModel.findById(id)
}

// Asignar empresa a un recorrido — solo municipio y admin
const assignCompany = async (id, company_id, requestingUser) => {
  const route = await routeModel.findById(id)
  if (!route) {
    const err = new Error('Recorrido no encontrado')
    err.statusCode = 404
    throw err
  }

  if (company_id) {
    const company = await companyModel.findById(company_id)
    if (!company || !company.is_active) {
      const err = new Error('La empresa no existe o está inactiva')
      err.statusCode = 400
      throw err
    }
  }

  await routeModel.assignCompany(id, company_id)

  await auditService.record({
  requestingUser,
  action:     auditService.ACTIONS.COMPANY_ASSIGNED,
  entity:     auditService.ENTITIES.COLLECTION_ROUTE,
  entity_id:  parseInt(id),
  old_values: { company_id: route.company_id },
  new_values: { company_id }
})

  return routeModel.findById(id)
}

const remove = async (id) => {
  const route = await routeModel.findById(id)
  if (!route) {
    const err = new Error('Recorrido no encontrado')
    err.statusCode = 404
    throw err
  }
  await routeModel.remove(id)
  return { message: 'Recorrido desactivado correctamente' }
}

module.exports = { getAll, getById, create, update, assignCompany, remove }