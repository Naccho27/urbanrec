'use strict'

const authService = require('../services/auth.service')
const authModel = require('../models/auth.model')
const { fail } = require('../../../shared/utils/responses')

// Verifica el JWT de cada request privado.
// Si el token es válido agrega req.user con los datos del usuario.
// Si no, devuelve 401.
//
// Uso en rutas:
// router.get('/ruta', verifyJWT, miController)

const verifyJWT = async (req, res, next) => {
  try {
    // Primero busca en cookie, después en header (para compatibilidad con Postman)
    const token = req.cookies?.accessToken || 
                  req.headers['authorization']?.split(' ')[1]

    if (!token) {
      return fail(res, 'Token de acceso requerido', 401)
    }

    let decoded
    try {
      decoded = authService.verifyToken(token)
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return fail(res, 'Token expirado. Inicie sesión nuevamente', 401)
      }
      return fail(res, 'Token inválido', 401)
    }

    const user = await authModel.findById(decoded.id)

    if (!user || !user.is_active || user.deleted_at) {
      return fail(res, 'Usuario no autorizado o inactivo', 401)
    }

    req.user = {
      id:         user.id,
      email:      user.email,
      role:       user.role,
      company_id: user.company_id || null
    }

    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { verifyJWT }