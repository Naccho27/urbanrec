'use strict'

const logger = require('../utils/logger')

// Manejador de errores global de Express.
// Debe tener exactamente 4 parámetros para que Express
// lo reconozca como error handler.
// Siempre va al final de app.js, después de todas las rutas.

const errorHandler = (err, req, res, next) => {

  // Log del error completo para debugging interno
  logger.error({
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method
  })

  // Si el error tiene statusCode lo usamos, sino 500
  const status  = err.statusCode || err.status || 500
  const message = err.message    || 'Error interno del servidor'

  // En producción no exponemos el stack trace al cliente
  const response = {
    ok:      false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  }

  res.status(status).json(response)
}

module.exports = errorHandler