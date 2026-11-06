'use strict'

const Redis  = require('ioredis')
const logger = require('../shared/utils/logger')

// Cliente Redis con reconexión automática
// Si Redis no está disponible, el sistema sigue funcionando sin caché
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,

  // Reintentos de conexión con backoff exponencial
  retryStrategy(times) {
    if (times > 3) {
      // Después de 3 intentos deja de reintentar
      // El sistema funciona sin caché
      return null
    }
    return Math.min(times * 500, 2000)
  },

  // No falla si Redis no está disponible al arrancar
  lazyConnect:            false,
  enableOfflineQueue:     false,
  maxRetriesPerRequest:   2
})

let isAvailable = false

redis.on('connect', () => {
  isAvailable = true
  logger.info('Conexión a Redis establecida')
})

redis.on('error', (err) => {
  if (isAvailable) {
    logger.warn(`Redis desconectado: ${err.message}. El sistema continúa sin caché.`)
  }
  isAvailable = false
})

redis.on('close', () => {
  isAvailable = false
})

// Permite a los services saber si Redis está disponible
const isRedisAvailable = () => isAvailable

module.exports = { redis, isRedisAvailable }