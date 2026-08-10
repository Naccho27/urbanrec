'use strict'

const scheduleModel = require('../models/schedule.model')
const routeModel    = require('../../collection-routes/models/collection-route.model')
const companyModel  = require('../../users/models/company.model')
const { ROLES }     = require('../../../shared/utils/roles')
const { SHIFT }     = require('../../../shared/utils/constants')

const getAll = async (filters, requestingUser) => {
  // Operador empresa solo ve sus cronogramas
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    filters.company_id = requestingUser.company_id
  }
  return scheduleModel.findAll(filters)
}

const getById = async (id, requestingUser) => {
  const schedule = await scheduleModel.findById(id)
  if (!schedule) {
    const err = new Error('Cronograma no encontrado')
    err.statusCode = 404
    throw err
  }

  // Operador empresa solo puede ver sus cronogramas
  if (
    requestingUser.role === ROLES.OPERATOR_COMPANY &&
    schedule.company_id !== requestingUser.company_id
  ) {
    const err = new Error('No tiene acceso a este cronograma')
    err.statusCode = 403
    throw err
  }

  return schedule
}

// Cronogramas vigentes para una fecha — usado por el conductor
// para saber qué recorridos tiene asignados hoy
const getForDate = async (date, requestingUser) => {
  const company_id = requestingUser.role === ROLES.OPERATOR_COMPANY
    ? requestingUser.company_id
    : null

  return scheduleModel.findActiveForDate(date, company_id)
}

const create = async (data, requestingUser) => {
  // Verificar que el recorrido existe y está activo
  const route = await routeModel.findById(data.collection_route_id)
  if (!route || !route.is_active) {
    const err = new Error('El recorrido no existe o está inactivo')
    err.statusCode = 400
    throw err
  }

  // Si viene company_id verificar que existe
  if (data.company_id) {
    const company = await companyModel.findById(data.company_id)
    if (!company || !company.is_active) {
      const err = new Error('La empresa no existe o está inactiva')
      err.statusCode = 400
      throw err
    }
  }

  // Validar que los días de la semana son válidos (1-7)
  if (data.week_days) {
    const valid = data.week_days.every(d => Number.isInteger(d) && d >= 1 && d <= 7)
    if (!valid) {
      const err = new Error('Los días de la semana deben ser números entre 1 (lunes) y 7 (domingo)')
      err.statusCode = 400
      throw err
    }
    // Sin duplicados
    data.week_days = [...new Set(data.week_days)].sort()
  }

  // valid_from no puede ser anterior a hoy
  const today = new Date().toISOString().split('T')[0]
  if (data.valid_from < today) {
    const err = new Error('La fecha de inicio no puede ser anterior a hoy')
    err.statusCode = 400
    throw err
  }

  // valid_until debe ser posterior a valid_from
  if (data.valid_until && data.valid_until <= data.valid_from) {
    const err = new Error('La fecha de fin debe ser posterior a la fecha de inicio')
    err.statusCode = 400
    throw err
  }

  const id = await scheduleModel.create({
    ...data,
    created_by: requestingUser.id
  })

  return scheduleModel.findById(id)
}

const update = async (id, data, requestingUser) => {
  const schedule = await scheduleModel.findById(id)
  if (!schedule) {
    const err = new Error('Cronograma no encontrado')
    err.statusCode = 404
    throw err
  }

  // Operador empresa no puede modificar cronogramas
  if (requestingUser.role === ROLES.OPERATOR_COMPANY) {
    const err = new Error('El operador de empresa no puede modificar cronogramas')
    err.statusCode = 403
    throw err
  }

  if (data.week_days) {
    data.week_days = [...new Set(data.week_days)].sort()
  }

  await scheduleModel.update(id, data)
  return scheduleModel.findById(id)
}

const remove = async (id) => {
  const schedule = await scheduleModel.findById(id)
  if (!schedule) {
    const err = new Error('Cronograma no encontrado')
    err.statusCode = 404
    throw err
  }
  await scheduleModel.remove(id)
  return { message: 'Cronograma desactivado correctamente' }
}

module.exports = { getAll, getById, getForDate, create, update, remove }