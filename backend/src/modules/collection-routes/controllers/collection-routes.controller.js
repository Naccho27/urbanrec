'use strict'

const routesService = require('../services/collection-routes.service')
const { ok }        = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    zone_id:      req.query.zone_id      || undefined,
    waste_type_id: req.query.waste_type_id || undefined,
    company_id:   req.query.company_id   || undefined,
    is_active:    req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : undefined
  }
  const routes = await routesService.getAll(filters, req.user)
  return ok(res, { routes, total: routes.length })
}

const getById = async (req, res) => {
  const route = await routesService.getById(req.params.id, req.user)
  return ok(res, { route })
}

const create = async (req, res) => {
  const route = await routesService.create(req.body, req.user)
  return ok(res, { route }, 'Recorrido creado correctamente', 201)
}

const update = async (req, res) => {
  const route = await routesService.update(req.params.id, req.body, req.user)
  return ok(res, { route }, 'Recorrido actualizado correctamente')
}

const assignCompany = async (req, res) => {
  const { company_id } = req.body
  const route = await routesService.assignCompany(req.params.id, company_id, req.user)
  return ok(res, { route }, company_id
    ? 'Empresa asignada al recorrido correctamente'
    : 'Empresa desasignada del recorrido'
  )
}

const remove = async (req, res) => {
  const result = await routesService.remove(req.params.id)
  return ok(res, null, result.message)
}

module.exports = { getAll, getById, create, update, assignCompany, remove }