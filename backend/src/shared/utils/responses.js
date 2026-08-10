'use strict'

// Helpers para estandarizar todas las respuestas de la API.
// Todos los controllers usan estas funciones en lugar de
// llamar a res.json() directamente.
//
// Uso:
// ok(res, { user }, 'Usuario creado', 201)
// fail(res, 'No autorizado', 401)

const ok = (res, data = null, message = 'OK', statusCode = 200) => {
  const response = { ok: true, message }
  if (data !== null) response.data = data
  return res.status(statusCode).json(response)
}

const fail = (res, message = 'Error', statusCode = 400, errors = null) => {
  const response = { ok: false, message }
  if (errors) response.errors = errors
  return res.status(statusCode).json(response)
}

module.exports = { ok, fail }