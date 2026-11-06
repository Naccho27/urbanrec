'use strict'

const authService = require('../services/auth.service')
const authModel   = require('../models/auth.model')
const cache       = require('../../../shared/services/cache.service')
const { fail }    = require('../../../shared/utils/responses')
const { ROLES }   = require('../../../shared/utils/roles')

// Tiempo máximo de inactividad por defecto en segundos
// Se sobreescribe con el valor de system_settings si está disponible
const DEFAULT_INACTIVITY_TIMEOUT = 1800  // 30 minutos

// Verifica el JWT de cada request privado.
// Si el token es válido agrega req.user con los datos del usuario.
// Además controla la inactividad de la sesión usando Redis.
//
// Uso en rutas:
// router.get('/ruta', verifyJWT, miController)

const verifyJWT = async (req, res, next) => {
  try {
    // El token viene en cookie httpOnly o en header Authorization
    const token = req.cookies?.accessToken ||
                  req.headers['authorization']?.split(' ')[1]

    if (!token) {
      return fail(res, 'Token de acceso requerido', 401)
    }

    // Verificar y decodificar el token
    let decoded
    try {
      decoded = authService.verifyToken(token)
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return fail(res, 'Token expirado. Inicie sesión nuevamente', 401)
      }
      return fail(res, 'Token inválido', 401)
    }

    // Un pendingToken no sirve para acceder a rutas privadas
    // Solo habilita completar el paso 2 del login
    if (decoded.purpose === 'totp_pending') {
      return fail(res, 'Token inválido para esta operación', 401)
    }

    // Verificar que el usuario sigue activo en la DB
    // (puede haber sido desactivado después de emitir el token)
    const user = await authModel.findById(decoded.id)

    if (!user || !user.is_active || user.deleted_at) {
      return fail(res, 'Usuario no autorizado o inactivo', 401)
    }

        // ── Control de inactividad ───────────────────────────
    // El conductor queda exento mientras el GPS reporte:
    // cada punto GPS actualiza la actividad automáticamente
    const timeout = await getInactivityTimeout()
    const activityKey = `activity:${user.id}`
    const lastActivity = await cache.get(activityKey)

    if (lastActivity) {
      const elapsedMs = Date.now() - lastActivity
      if (elapsedMs > timeout * 1000) {
        // Sesión abandonada — limpiar todo y forzar re-login
        await cache.del(activityKey)
        res.clearCookie('accessToken')
        res.clearCookie('refreshToken')
        return fail(res, 'Sesión cerrada por inactividad. Inicie sesión nuevamente', 401)
      }
    }

    // Renovar el timestamp de última actividad.
    // El TTL es el doble del timeout a propósito: la clave debe sobrevivir
    // más allá de la ventana de inactividad para que el servidor pueda
    // detectar que venció. Si el TTL fuera igual al timeout, la clave
    // desaparecería sola y la sesión se reiniciaría en lugar de cerrarse.
    await cache.set(activityKey, Date.now(), timeout * 2)

    // Agregar datos del usuario al request
    // Disponibles en todos los controllers siguientes
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

// Lee el timeout de inactividad de system_settings
// Si falla usa el valor por defecto — no puede romper la autenticación
const getInactivityTimeout = async () => {
  try {
    const settingsService = require('../../settings/services/settings.service')
    const minutes = await settingsService.get('session_inactivity_timeout_min')
    return minutes ? minutes * 60 : DEFAULT_INACTIVITY_TIMEOUT
  } catch {
    return DEFAULT_INACTIVITY_TIMEOUT
  }
}

module.exports = { verifyJWT }