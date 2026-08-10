'use strict'

const companyService = require('../services/company.service')
const { ok }         = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    is_active: req.query.is_active !== undefined
                 ? req.query.is_active === 'true'
                 : undefined
  }
  const companies = await companyService.getAll(filters)
  return ok(res, { companies, total: companies.length })
}

const getById = async (req, res) => {
  const company = await companyService.getById(req.params.id)
  return ok(res, { company })
}

const create = async (req, res) => {
  const company = await companyService.create(req.body)
  return ok(res, { company }, 'Empresa creada correctamente', 201)
}

const update = async (req, res) => {
  const company = await companyService.update(req.params.id, req.body)
  return ok(res, { company }, 'Empresa actualizada correctamente')
}

const deactivate = async (req, res) => {
  const result = await companyService.deactivate(req.params.id)
  return ok(res, null, result.message)
}

const reactivate = async (req, res) => {
  const company = await companyService.reactivate(req.params.id)
  return ok(res, { company }, 'Empresa reactivada correctamente')
}

module.exports = { getAll, getById, create, update, deactivate, reactivate }