'use strict'

// Constantes de roles del sistema.
// Se usan en middlewares, validators y seeds.
// Nunca hardcodear strings de roles en el código.

const ROLES = Object.freeze({
  ADMIN:            'admin',
  MUNICIPAL:        'municipal',
  OPERATOR_COMPANY: 'operator_company',
  CONDUCTOR:        'conductor',
  CITIZEN:          'citizen'
})

module.exports = { ROLES }