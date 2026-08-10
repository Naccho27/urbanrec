'use strict'

const rateLimit = require('express-rate-limit')

// Límite general — todas las rutas
const generalLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // ventana de 15 minutos
  max:              200,              // máximo 200 requests por IP en esa ventana
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    ok:      false,
    message: 'Demasiadas solicitudes. Intente nuevamente en 15 minutos.'
  }
})

// Límite estricto para auth — evita fuerza bruta
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutos
  max:              10,               // solo 10 intentos de login por IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    ok:      false,
    message: 'Demasiados intentos de acceso. Intente nuevamente en 15 minutos.'
  }
})

// Límite para endpoints públicos — ciudadanos consultando
const publicLimiter = rateLimit({
  windowMs:         1 * 60 * 1000,   // ventana de 1 minuto
  max:              60,               // 60 requests por minuto por IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    ok:      false,
    message: 'Demasiadas solicitudes. Intente nuevamente en un momento.'
  }
})

module.exports = { generalLimiter, authLimiter, publicLimiter }