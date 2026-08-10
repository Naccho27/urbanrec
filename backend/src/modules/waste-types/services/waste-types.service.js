'use strict'

const wasteTypeModel = require('../models/waste-type.model')

const getAll = async (filters) => {
  return wasteTypeModel.findAll(filters)
}

const getById = async (id) => {
  const wt = await wasteTypeModel.findById(id)
  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }
  return wt
}

const create = async (data) => {
  // Verificar nombre duplicado
  const existing = await wasteTypeModel.findByName(data.name)
  if (existing) {
    const err = new Error('Ya existe un tipo de residuo con ese nombre')
    err.statusCode = 409
    throw err
  }
  const id = await wasteTypeModel.create(data)
  return wasteTypeModel.findById(id)
}

const update = async (id, data) => {
  const wt = await wasteTypeModel.findById(id)
  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }

  // Verificar nombre duplicado si se está cambiando
  if (data.name && data.name !== wt.name) {
    const existing = await wasteTypeModel.findByName(data.name)
    if (existing) {
      const err = new Error('Ya existe un tipo de residuo con ese nombre')
      err.statusCode = 409
      throw err
    }
  }

  await wasteTypeModel.update(id, data)
  return wasteTypeModel.findById(id)
}

const remove = async (id) => {
  const wt = await wasteTypeModel.findById(id)
  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }
  await wasteTypeModel.remove(id)
  return { message: 'Tipo de residuo desactivado correctamente' }
}

module.exports = { getAll, getById, create, update, remove }