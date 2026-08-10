'use strict'

const incidentsService = require('../services/incidents.service')
const { ok }           = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    execution_id: req.query.execution_id || undefined,
    company_id:   req.query.company_id   || undefined,
    zone_id:      req.query.zone_id      || undefined,
    type:         req.query.type         || undefined,
    status:       req.query.status       || undefined
  }
  const incidents = await incidentsService.getAll(filters, req.user)
  return ok(res, { incidents, total: incidents.length })
}

const getById = async (req, res) => {
  const incident = await incidentsService.getById(req.params.id, req.user)
  return ok(res, { incident })
}

const create = async (req, res) => {
  const incident = await incidentsService.create(req.body, req.user)
  return ok(res, { incident }, 'Incidente reportado correctamente', 201)
}

const resolve = async (req, res) => {
  const incident = await incidentsService.resolve(
    req.params.id,
    req.body,
    req.user
  )
  return ok(res, { incident }, 'Incidente actualizado correctamente')
}

module.exports = { getAll, getById, create, resolve }