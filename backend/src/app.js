'use strict'

const express      = require('express')
const cors         = require('cors')
const helmet       = require('helmet')
const morgan       = require('morgan')
const cookieParser = require('cookie-parser')
const compression  = require('compression')

const { client, server }   = require('./config/env')
const notFound             = require('./shared/middlewares/notFound.middleware')
const errorHandler         = require('./shared/middlewares/error.middleware')
const logger               = require('./shared/utils/logger')
const { generalLimiter }   = require('./shared/middlewares/rateLimit.middleware')

const app = express()

// ── Seguridad ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https://*.tile.openstreetmap.org"],
      connectSrc:  ["'self'", "wss:", "ws:"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true
  },
  frameguard:     { action: 'deny' },
  noSniff:        true,
  xssFilter:      true,
  referrerPolicy: { policy: 'same-origin' }
}))

// ── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin:      client.url,
  credentials: true
}))

// ── Compresión gzip ───────────────────────────────────────
// Comprime responses mayores a 1KB — reduce ancho de banda hasta 70%
app.use(compression({
  level:     6,
  threshold: 1024
}))

// ── Rate limiting general ─────────────────────────────────
// 200 requests por IP cada 15 minutos
app.use(generalLimiter)

// ── Cookies ───────────────────────────────────────────────
app.use(cookieParser())

// ── Parsing ───────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Logs HTTP ─────────────────────────────────────────────
if (server.env === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) }
  }))
}

// ── Rutas ─────────────────────────────────────────────────
app.use('/api/v1', require('./api'))

// ── 404 ───────────────────────────────────────────────────
app.use(notFound)

// ── Error handler global ──────────────────────────────────
app.use(errorHandler)

module.exports = app