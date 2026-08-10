'use strict'

const companyModel = require('../models/company.model')

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

const create = async (data) => {
  // Verificar nombre duplicado
  const existing = await companyModel.findByName(data.name)
  if (existing) {
    const err = new Error('Ya existe una empresa con ese nombre')
    err.statusCode = 409
    throw err
  }
  const id = await companyModel.create(data)
  return companyModel.findById(id)
}

const update = async (id, data) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.update(id, data)
  return companyModel.findById(id)
}

const deactivate = async (id) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.deactivate(id)
  return { message: 'Empresa y sus usuarios desactivados correctamente' }
}

const reactivate = async (id) => {
  const company = await companyModel.findById(id)
  if (!company) {
    const err = new Error('Empresa no encontrada')
    err.statusCode = 404
    throw err
  }
  await companyModel.reactivate(id)
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