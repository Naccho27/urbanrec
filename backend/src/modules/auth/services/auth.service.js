'use strict'

const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { jwt: jwtConfig } = require('../../../config/env')

const SALT_ROUNDS = 12

// Hashea una contraseña con bcrypt
// Se usa al crear o actualizar contraseñas
const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}

// Compara una contraseña en texto plano con el hash
// Retorna true si coinciden, false si no
const comparePassword = async (plainPassword, hash) => {
  return bcrypt.compare(plainPassword, hash)
}

// Genera un access token JWT con los datos del usuario
// Expira según JWT_EXPIRES_IN del .env (ej: 8h)
const signToken = (payload) => {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn
  })
}

// Genera un refresh token de larga duración
// Se usa para renovar el access token sin re-login
const signRefreshToken = (payload) => {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.refreshExpires
  })
}

// Verifica y decodifica un token JWT
// Retorna el payload o lanza error si es inválido/expirado
const verifyToken = (token) => {
  return jwt.verify(token, jwtConfig.secret)
}

// Construye el payload estándar del token JWT
// Solo incluye lo necesario — menos datos = token más pequeño
const buildTokenPayload = (user) => ({
  id:         user.id,
  role:       user.role,
  company_id: user.company_id || null
})

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  signRefreshToken,
  verifyToken,
  buildTokenPayload
}