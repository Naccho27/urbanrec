'use strict'

const settingsModel = require('../models/settings.model')
const logger        = require('../../../shared/utils/logger')

// Caché en memoria — evita ir a la DB en cada punto GPS
const cache = {}

const get = async (key) => {
  if (cache[key] !== undefined) return cache[key]

  const setting = await settingsModel.findByKey(key)
  if (!setting) return null

  let value = setting.value
  if (setting.type === 'number')  value = parseFloat(value)
  if (setting.type === 'boolean') value = value === 'true'
  if (setting.type === 'json')    value = JSON.parse(value)

  cache[key] = value
  return value
}

const getAll = async () => {
  const rows = await settingsModel.findAll()

  // Convertir valores según tipo
  return rows.map(row => {
    let value = row.value
    if (row.type === 'number')  value = parseFloat(value)
    if (row.type === 'boolean') value = value === 'true'
    if (row.type === 'json')    value = JSON.parse(value)
    return { ...row, value }
  })
}

const set = async (key, value, updatedBy) => {
  const setting = await settingsModel.findByKey(key)
  if (!setting) {
    const err = new Error(`Parámetro '${key}' no existe en el sistema`)
    err.statusCode = 404
    throw err
  }

  // Validar tipo antes de guardar
  if (setting.type === 'number' && isNaN(parseFloat(value))) {
    const err = new Error(`El parámetro '${key}' debe ser un número`)
    err.statusCode = 400
    throw err
  }
  if (setting.type === 'boolean' && !['true', 'false'].includes(String(value))) {
    const err = new Error(`El parámetro '${key}' debe ser true o false`)
    err.statusCode = 400
    throw err
  }

  const updated = await settingsModel.update(key, value, updatedBy)
  if (!updated) {
    const err = new Error('No se pudo actualizar el parámetro')
    err.statusCode = 500
    throw err
  }

  // Limpiar caché para que el próximo get lea el valor nuevo
  delete cache[key]

  logger.info(`Setting actualizado: ${key} = ${value} por user ${updatedBy}`)
  return settingsModel.findByKey(key)
}

module.exports = { get, getAll, set }