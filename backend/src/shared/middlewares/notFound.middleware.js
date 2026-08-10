'use strict'

// Se ejecuta cuando ninguna ruta coincide con el request.
// Genera un error 404 y lo pasa al error handler global.

const notFound = (req, res, next) => {
  const err = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`)
  err.statusCode = 404
  next(err)
}

module.exports = notFound