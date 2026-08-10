'use strict'

const zonesService = require('../services/zones.service')
const { ok }       = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    is_active: req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : undefined
  }
  const zones = await zonesService.getAll(filters)
  return ok(res, { zones, total: zones.length })
}

const getById = async (req, res) => {
  const zone = await zonesService.getById(req.params.id)
  return ok(res, { zone })
}

const findByAddress = async (req, res) => {
  const { address } = req.query
  if (!address) {
    return ok(res, { zones: [], coords: null }, 'Dirección requerida')
  }
  const result = await zonesService.findByAddress(address)
  return ok(res, result)
}

const create = async (req, res) => {
  const zone = await zonesService.create(req.body, req.user)
  return ok(res, { zone }, 'Zona creada correctamente', 201)
}

const update = async (req, res) => {
  const zone = await zonesService.update(req.params.id, req.body, req.user)
  return ok(res, { zone }, 'Zona actualizada correctamente')
}

const remove = async (req, res) => {
  const result = await zonesService.remove(req.params.id)
  return ok(res, null, result.message)
}

module.exports = { getAll, getById, findByAddress, create, update, remove }