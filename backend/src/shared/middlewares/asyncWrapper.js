'use strict'

// Envuelve cualquier controller async en un try/catch
// que llama a next(err) si hay un error.
// Evita repetir try/catch en cada controller.
//
// Uso:
// router.get('/ruta', asyncWrapper(miController))

const asyncWrapper = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = asyncWrapper