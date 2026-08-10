'use strict'

const wasteTypesService = require('../services/waste-types.service')
const { ok }            = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    is_active: req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : undefined
  }
  const wasteTypes = await wasteTypesService.getAll(filters)
  return ok(res, { wasteTypes, total: wasteTypes.length })
}

const getById = async (req, res) => {
  const wasteType = await wasteTypesService.getById(req.params.id)
  return ok(res, { wasteType })
}

const create = async (req, res) => {
  const wasteType = await wasteTypesService.create(req.body)
  return ok(res, { wasteType }, 'Tipo de residuo creado correctamente', 201)
}

const update = async (req, res) => {
  const wasteType = await wasteTypesService.update(req.params.id, req.body)
  return ok(res, { wasteType }, 'Tipo de residuo actualizado correctamente')
}

const remove = async (req, res) => {
  const result = await wasteTypesService.remove(req.params.id)
  return ok(res, null, result.message)
}

module.exports = { getAll, getById, create, update, remove }