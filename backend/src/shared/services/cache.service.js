'use strict'

const { redis, isRedisAvailable } = require('../../config/redis')
const logger = require('../utils/logger')

// TTL por defecto en segundos
const DEFAULT_TTL = 3600  // 1 hora

// Prefijos de claves para organizar el caché
// Permite invalidar grupos completos fácilmente
const KEYS = Object.freeze({
  ZONES:        'zones',
  ZONE:         'zone',
  WASTE_TYPES:  'waste_types',
  SETTINGS:     'settings',
  SCHEDULES:    'schedules',
  PUBLIC_ALERTS: 'public_alerts'
})

// Obtiene un valor del caché
// Retorna null si no existe o si Redis no está disponible
const get = async (key) => {
  if (!isRedisAvailable()) return null

  try {
    const value = await redis.get(key)
    return value ? JSON.parse(value) : null
  } catch (err) {
    logger.warn(`Cache get error [${key}]: ${err.message}`)
    return null
  }
}

// Guarda un valor en el caché con TTL
const set = async (key, value, ttl = DEFAULT_TTL) => {
  if (!isRedisAvailable()) return false

  try {
    await redis.setex(key, ttl, JSON.stringify(value))
    return true
  } catch (err) {
    logger.warn(`Cache set error [${key}]: ${err.message}`)
    return false
  }
}

// Elimina una clave específica del caché
const del = async (key) => {
  if (!isRedisAvailable()) return false

  try {
    await redis.del(key)
    return true
  } catch (err) {
    logger.warn(`Cache del error [${key}]: ${err.message}`)
    return false
  }
}

// Elimina todas las claves que coincidan con un patrón
// Usado para invalidar grupos: invalidatePattern('zones:*')
const invalidatePattern = async (pattern) => {
  if (!isRedisAvailable()) return false

  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
      logger.info(`Cache invalidado: ${keys.length} claves con patrón ${pattern}`)
    }
    return true
  } catch (err) {
    logger.warn(`Cache invalidate error [${pattern}]: ${err.message}`)
    return false
  }
}

// Helper principal — patrón cache-aside
// Si está en caché lo devuelve, si no ejecuta la función y cachea el resultado
//
// Uso:
//   const zones = await cache.remember('zones:all', 3600, async () => {
//     return zoneModel.findAll()
//   })
const remember = async (key, ttl, fetchFn) => {
  // Intentar leer del caché
  const cached = await get(key)
  if (cached !== null) {
    return cached
  }

  // Cache miss — ejecutar la función que trae los datos
  const fresh = await fetchFn()

  // Guardar en caché para próximas consultas
  if (fresh !== null && fresh !== undefined) {
    await set(key, fresh, ttl)
  }

  return fresh
}

module.exports = {
  get,
  set,
  del,
  invalidatePattern,
  remember,
  KEYS,
  DEFAULT_TTL
}