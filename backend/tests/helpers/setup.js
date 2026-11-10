'use strict'

// ─────────────────────────────────────────────────────────
// Preparación común de los tests unitarios.
//
// Los tests unitarios prueban la lógica de cada servicio SIN base de
// datos ni Redis: se reemplazan esos módulos por versiones falsas
// ("stubs") antes de cargar el código a probar. Así los tests corren
// en un segundo, en cualquier PC, y no tocan los datos reales.
//
// Se usa el test runner que viene con Node (node:test), así que no hace
// falta instalar ninguna librería de testing.
// ─────────────────────────────────────────────────────────

const path = require('path')

// Variables mínimas para que config/env.js no corte el proceso
Object.assign(process.env, {
  NODE_ENV:            'test',
  PORT:                '0',
  DB_HOST:             'localhost',
  DB_PORT:             '3306',
  DB_USER:             'test',
  DB_PASSWORD:         'test',
  DB_NAME:             'test',
  JWT_SECRET:          'secreto-solo-para-tests',
  JWT_EXPIRES_IN:      '1h',
  TOTP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
  CLIENT_URL:          'http://localhost:5173'
})

const SRC = path.join(__dirname, '..', '..', 'src')

// Registra un módulo falso en la caché de require: cualquier archivo que
// después haga require() de esa ruta recibe el stub en vez del real
const stubModule = (relativePath, exports) => {
  const resolved = require.resolve(path.join(SRC, relativePath))
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }
  return exports
}

// Base de datos falsa: cada test define qué devuelve cada consulta
const pool = stubModule('config/db', {
  execute:       async () => [[]],
  query:         async () => [[]],
  getConnection: async () => ({ release () {} })
})

// Redis apagado: el caché degrada a "sin caché", como en producción
// cuando Redis no responde
stubModule('config/redis', {
  redis: {},
  isRedisAvailable: () => false
})

// Logger silencioso para que la salida de los tests quede limpia
stubModule('shared/utils/logger', {
  info () {}, warn () {}, error () {}, debug () {}
})

const load = (relativePath) => require(path.join(SRC, relativePath))

module.exports = { pool, load, stubModule, SRC }
