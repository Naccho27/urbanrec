'use strict'

require('dotenv').config()

const required = [
  'PORT',
  'NODE_ENV',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'TOTP_ENCRYPTION_KEY',
  'CLIENT_URL'
]

const missing = required.filter(key => !process.env[key])

if (missing.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`)
  process.exit(1)
}

module.exports = {
  server: {
    port: parseInt(process.env.PORT, 10),
    env:  process.env.NODE_ENV
  },
  db: {
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT, 10),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name:     process.env.DB_NAME
  },
  jwt: {
    secret:         process.env.JWT_SECRET,
    expiresIn:      process.env.JWT_EXPIRES_IN,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  totp: {
    encryptionKey: process.env.TOTP_ENCRYPTION_KEY
  },
  client: {
    url: process.env.CLIENT_URL
  },
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000'
  }

  
}