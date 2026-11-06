'use strict'

const settingsModel = require('../models/settings.model')
const cache         = require('../../../shared/services/cache.service')
const logger        = require('../../../shared/utils/logger')

// TTL de settings: 2 horas
// Se leen en cada punto GPS del conductor — el caché evita ir a la DB constantemente
// Antes usábamos caché en memoria del proceso, ahora Redis lo hace persistente
// entre reinicios del servidor y compartido si hay múltiples instancias
const SETTINGS_TTL = 7200

const get = async (key) => {
  const cacheKey = `${cache.KEYS.SETTINGS}:${key}`

  // remember: si está en caché lo devuelve, si no consulta la DB y cachea
  return cache.remember(cacheKey, SETTINGS_TTL, async () => {
    const setting = await settingsModel.findByKey(key)
    if (!setting) return null

    let value = setting.value
    if (setting.type === 'number')  value = parseFloat(value)
    if (setting.type === 'boolean') value = value === 'true'
    if (setting.type === 'json')    value = JSON.parse(value)

    return value
  })
}

const getAll = async () => {
  const cacheKey = `${cache.KEYS.SETTINGS}:all`

  return cache.remember(cacheKey, SETTINGS_TTL, async () => {
    const rows = await settingsModel.findAll()

    // Convertir valores según tipo
    return rows.map(row => {
      let value = row.value
      if (row.type === 'number')  value = parseFloat(value)
      if (row.type === 'boolean') value = value === 'true'
      if (row.type === 'json')    value = JSON.parse(value)
      return { ...row, value }
    })
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
  // Invalidamos tanto la clave individual como el listado completo
  await cache.del(`${cache.KEYS.SETTINGS}:${key}`)
  await cache.del(`${cache.KEYS.SETTINGS}:all`)

  logger.info(`Setting actualizado: ${key} = ${value} por user ${updatedBy}`)
  return settingsModel.findByKey(key)
}

module.exports = { get, getAll, set }