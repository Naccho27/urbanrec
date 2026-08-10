'use strict'

const { validationResult } = require('express-validator')

// Corre después de las reglas de express-validator.
// Si hay errores de validación devuelve 422 con el detalle.
// Si todo está bien llama a next() y continúa al controller.
//
// Uso en una ruta:
// router.post('/login', [...reglas], validate, authController.login)

const validate = (req, res, next) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).json({
      ok:      false,
      message: 'Error de validación',
      errors:  errors.array().map(e => ({
        field:   e.path,
        message: e.msg
      }))
    })
  }

  next()
}

module.exports = validate