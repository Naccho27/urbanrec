'use strict'

// Logger simple usando console con niveles y timestamps.
// En producción se puede reemplazar por winston o pino
// sin cambiar ningún módulo que lo importe.

// Correcto — sube dos niveles hasta src/ y encuentra config/env
const { server } = require('../../config/env')

// Colores para la terminal en desarrollo
const COLORS = {
  reset:  '\x1b[0m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m'
}

const timestamp = () => new Date().toISOString()

const logger = {
  info: (msg) => {
    if (server.env === 'development') {
      console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${timestamp()} - ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`)
    }
  },
  warn: (msg) => {
    console.warn(`${COLORS.yellow}[WARN]${COLORS.reset} ${timestamp()} - ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`)
  },
  error: (msg) => {
    console.error(`${COLORS.red}[ERROR]${COLORS.reset} ${timestamp()} - ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`)
  },
  debug: (msg) => {
    if (server.env === 'development') {
      console.log(`${COLORS.gray}[DEBUG]${COLORS.reset} ${timestamp()} - ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`)
    }
  }
}

module.exports = logger