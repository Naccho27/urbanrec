'use strict'

const schedulesService = require('../services/schedules.service')
const { ok }           = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    collection_route_id: req.query.route_id      || undefined,
    company_id:          req.query.company_id    || undefined,
    shift:               req.query.shift         || undefined,
    is_active:           req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : undefined
  }
  const schedules = await schedulesService.getAll(filters, req.user)
  return ok(res, { schedules, total: schedules.length })
}

const getById = async (req, res) => {
  const schedule = await schedulesService.getById(req.params.id, req.user)
  return ok(res, { schedule })
}

// GET /api/v1/schedules/for-date?date=2026-07-08
// Retorna los cronogramas vigentes para una fecha
// El conductor lo usa para ver sus recorridos del día
const getForDate = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const schedules = await schedulesService.getForDate(date, req.user)
  return ok(res, { schedules, date, total: schedules.length })
}

const create = async (req, res) => {
  const schedule = await schedulesService.create(req.body, req.user)
  return ok(res, { schedule }, 'Cronograma creado correctamente', 201)
}

const update = async (req, res) => {
  const schedule = await schedulesService.update(req.params.id, req.body, req.user)
  return ok(res, { schedule }, 'Cronograma actualizado correctamente')
}

const remove = async (req, res) => {
  const result = await schedulesService.remove(req.params.id)
  return ok(res, null, result.message)
}

module.exports = { getAll, getById, getForDate, create, update, remove }