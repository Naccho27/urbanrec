'use strict'

const usersService = require('../services/users.service')
const { ok, fail }  = require('../../../shared/utils/responses')

const getAll = async (req, res) => {
  const filters = {
    role:       req.query.role       || undefined,
    company_id: req.query.company_id || undefined,
    is_active:  req.query.is_active !== undefined
                  ? req.query.is_active === 'true'
                  : undefined
  }
  const users = await usersService.getAll(filters)
  return ok(res, { users, total: users.length })
}

const getById = async (req, res) => {
  const user = await usersService.getById(req.params.id)
  return ok(res, { user })
}

const create = async (req, res) => {
  const user = await usersService.create(req.body, req.user)
  return ok(res, { user }, 'Usuario creado correctamente', 201)
}

const update = async (req, res) => {
  const user = await usersService.updateUser(req.params.id, req.body, req.user)
  return ok(res, { user }, 'Usuario actualizado correctamente')
}

const deactivate = async (req, res) => {
  const result = await usersService.deactivate(req.params.id, req.user)
  return ok(res, null, result.message)
}

const activate = async (req, res) => {
  const user = await usersService.activate(req.params.id)
  return ok(res, { user }, 'Usuario reactivado correctamente')
}

module.exports = { getAll, getById, create, update, deactivate, activate }