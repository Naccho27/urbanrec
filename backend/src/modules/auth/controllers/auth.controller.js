'use strict'

const authModel    = require('../models/auth.model')
const authService  = require('../services/auth.service')
const totpService  = require('../services/totp.service')
const pool         = require('../../../config/db')
const { ok, fail } = require('../../../shared/utils/responses')
const { ROLES }    = require('../../../shared/utils/roles')
const auditService = require('../../audit/services/audit.service')

// Registra en auditoría una acción de autenticación con IP y navegador.
// user puede ser null (intento de login con un email que no existe).
// En los intentos fallidos sobre una cuenta existente, user_id es la
// cuenta atacada: así el admin puede filtrar "intentos contra mi usuario".
const auditAuth = (req, user, action, new_values = null) =>
  auditService.record({
    requestingUser: user ? { id: user.id, role: user.role, company_id: user.company_id } : null,
    action,
    entity:    auditService.ENTITIES.USER,
    entity_id: user?.id ?? null,
    new_values,
    ...auditService.fromRequest(req)
  })

// Helper para setear las cookies de auth
// Se reutiliza en login y verifyTOTPLogin
const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production'

  res.cookie('accessToken', accessToken, {
    httpOnly: true,           // JS no puede leerla — protección XSS
    secure:   isProd,         // solo HTTPS en producción
    sameSite: 'strict',       // protección CSRF
    maxAge:   8 * 60 * 60 * 1000  // 8 horas en ms
  })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000  // 7 días en ms
  })
}

// ── Login ─────────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body
  const ip         = req.ip
  const user_agent = req.headers['user-agent']

  const user = await authModel.findByEmail(email)

  if (!user || !user.is_active || user.deleted_at) {
    await authModel.registerLoginAttempt({ email, success: false, ip, user_agent })
    await auditAuth(req, user && user.is_active ? user : null, auditService.ACTIONS.LOGIN_FAILED,
      { email, reason: user ? 'cuenta inactiva' : 'email inexistente' })
    return fail(res, 'Credenciales inválidas', 401)
  }

  const passwordOk = await authService.comparePassword(password, user.password_hash)
  if (!passwordOk) {
    await authModel.registerLoginAttempt({ email, success: false, ip, user_agent })
    await auditAuth(req, user, auditService.ACTIONS.LOGIN_FAILED, { email, reason: 'contraseña incorrecta' })
    return fail(res, 'Credenciales inválidas', 401)
  }

  // Si tiene TOTP activo → respuesta intermedia
  // Emite un token temporal que habilita el paso 2 del login
  // Sin este token, /2fa/verify-login rechaza el request
  if (user.totp_enabled) {
    await authModel.registerLoginAttempt({ email, success: false, ip, user_agent })

    const pendingToken = authService.signPendingToken(user.id)

    return ok(res, {
      requiresTOTP: true,
      pendingToken
    }, 'Se requiere código de autenticación', 200)
  }

  if (user.role === ROLES.ADMIN && !user.totp_enabled) {
    return fail(res, 'El rol administrador requiere autenticación de dos factores. Configure TOTP antes de continuar.', 403)
  }

  const payload      = authService.buildTokenPayload(user)
  const accessToken  = authService.signToken(payload)
  const refreshToken = authService.signRefreshToken(payload)

  // Setear cookies httpOnly en lugar de devolver tokens en el body
  setAuthCookies(res, accessToken, refreshToken)

  await authModel.registerLoginAttempt({ email, success: true, ip, user_agent })
  await auditAuth(req, user, auditService.ACTIONS.LOGIN, { method: 'contraseña' })

   return ok(res, {
    // En desarrollo devolvemos el token también en el body
    // para poder probarlo en Postman con Bearer.
    // En producción el frontend usa la cookie directamente.
    ...(process.env.NODE_ENV === 'development' && { accessToken }),
    user: {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      company_id: user.company_id
    }
  }, 'Login exitoso')
}

// ── Verificar TOTP durante el login ──────────────────────
// Paso 2 del login. Requiere el pendingToken emitido en el paso 1,
// lo que garantiza que el usuario ya validó email y contraseña.
const verifyTOTPLogin = async (req, res) => {
  const { pendingToken, token } = req.body
  const ip         = req.ip
  const user_agent = req.headers['user-agent']

  // Verificar el token temporal del paso 1
  let decoded
  try {
    decoded = authService.verifyToken(pendingToken)
  } catch (jwtErr) {
    if (jwtErr.name === 'TokenExpiredError') {
      return fail(res, 'La sesión de autenticación expiró. Inicie sesión nuevamente', 401)
    }
    return fail(res, 'Token de sesión inválido', 401)
  }

  // Verificar que el token sea específicamente para completar el 2FA
  // Impide usar un accessToken normal para saltarse el paso de contraseña
  if (decoded.purpose !== 'totp_pending') {
    return fail(res, 'Token inválido para esta operación', 401)
  }

  const userId = decoded.id

  const [rows] = await pool.execute(
    'SELECT id, name, email, role, company_id, totp_secret, totp_enabled, is_active FROM users WHERE id = ? LIMIT 1',
    [userId]
  )
  const user = rows[0]

  if (!user || !user.is_active) {
    return fail(res, 'Usuario no encontrado', 404)
  }

  if (!user.totp_enabled || !user.totp_secret) {
    return fail(res, 'TOTP no configurado para este usuario', 400)
  }

  const valid = totpService.verifyTotpToken(user.totp_secret, token)
  if (!valid) {
    await authModel.registerLoginAttempt({ email: user.email, success: false, ip, user_agent })
    await auditAuth(req, user, auditService.ACTIONS.LOGIN_FAILED, { email: user.email, reason: 'código TOTP inválido' })
    return fail(res, 'Código de autenticación inválido o expirado', 401)
  }

  const payload      = authService.buildTokenPayload(user)
  const accessToken  = authService.signToken(payload)
  const refreshToken = authService.signRefreshToken(payload)

  setAuthCookies(res, accessToken, refreshToken)

  await authModel.registerLoginAttempt({ email: user.email, success: true, ip, user_agent })
  await auditAuth(req, user, auditService.ACTIONS.LOGIN, { method: 'contraseña + TOTP' })

  return ok(res, {
    ...(process.env.NODE_ENV === 'development' && { accessToken }),
    user: {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      company_id: user.company_id
    }
  }, 'Login exitoso')
}

// ── Refresh token ─────────────────────────────────────────
const refreshToken = async (req, res) => {
  // Lee el refresh token de la cookie o del body (compatibilidad Postman)
  const token = req.cookies?.refreshToken || req.body.refreshToken

  if (!token) return fail(res, 'Token requerido', 400)

  let decoded
  try {
    decoded = authService.verifyToken(token)
  } catch {
    return fail(res, 'Refresh token inválido o expirado', 401)
  }

  const user = await authModel.findById(decoded.id)

  if (!user || !user.is_active || user.deleted_at) {
    return fail(res, 'Usuario no válido', 401)
  }

  const payload     = authService.buildTokenPayload(user)
  const accessToken = authService.signToken(payload)

  // Solo renovamos el accessToken
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   8 * 60 * 60 * 1000
  })

  return ok(res, null, 'Token renovado')
}

// ── Logout ────────────────────────────────────────────────
const logout = async (req, res) => {
  // Limpiar el registro de actividad para invalidar la sesión
  const cache = require('../../../shared/services/cache.service')
  await cache.del(`activity:${req.user.id}`)
  await auditAuth(req, req.user, auditService.ACTIONS.LOGOUT)

  res.clearCookie('accessToken')
  res.clearCookie('refreshToken')
  return ok(res, null, 'Sesión cerrada correctamente')
}

// ── Setup TOTP (requiere JWT) ─────────────────────────────
// Genera un secret nuevo y su QR. El secret queda en totp_pending_secret:
// recién reemplaza al activo cuando el usuario lo confirma con un código
// en /2fa/enable. Así, si no termina la configuración, su autenticador
// anterior sigue funcionando.
//
// Si el 2FA ya está activo, se exige la contraseña y un código de la app
// actual. Sin esto, alguien con una sesión robada podía vincular el 2FA
// a su propio celular sin conocer ninguno de los dos factores.
const setupTOTP = async (req, res) => {
  const userId = req.user.id
  const email  = req.user.email
  const { password, token } = req.body

  const [rows] = await pool.execute(
    'SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = ?',
    [userId]
  )
  const user = rows[0]
  if (!user) {
    return fail(res, 'Usuario no encontrado', 404)
  }

  if (user.totp_enabled) {
    if (!password || !token) {
      return fail(res, 'El 2FA ya está activo. Para reconfigurarlo envíe su contraseña y un código de su app actual', 400)
    }
    const passwordOk = await authService.comparePassword(password, user.password_hash)
    if (!passwordOk) {
      await auditAuth(req, req.user, auditService.ACTIONS.LOGIN_FAILED, { reason: 'contraseña incorrecta al reconfigurar 2FA' })
      return fail(res, 'Contraseña incorrecta', 401)
    }
    if (!totpService.verifyTotpToken(user.totp_secret, token)) {
      await auditAuth(req, req.user, auditService.ACTIONS.LOGIN_FAILED, { reason: 'código TOTP inválido al reconfigurar 2FA' })
      return fail(res, 'Código de autenticación inválido', 401)
    }
  }

  const secret          = totpService.generateSecret(email)
  const encryptedSecret = totpService.encryptSecret(secret)
  const qrCode          = await totpService.generateQR(secret, email)

  await pool.execute(
    'UPDATE users SET totp_pending_secret = ? WHERE id = ?',
    [encryptedSecret, userId]
  )

  // Se audita el hecho, nunca el secret
  await auditAuth(req, req.user, auditService.ACTIONS.UPDATE, { totp_secret: 'nuevo QR generado, pendiente de confirmar' })

  return ok(res, { qrCode, manualCode: secret },
    'QR generado. Escanee con Google Authenticator o Authy y confirme con un código')
}

// ── Enable TOTP (requiere JWT) ────────────────────────────
// Confirma el secret pendiente con un código de la app nueva y recién
// ahí lo pasa a totp_secret. Sirve tanto para activar el 2FA por primera
// vez como para cambiar de celular.
const enableTOTP = async (req, res) => {
  const { token } = req.body
  const userId    = req.user.id

  const [rows] = await pool.execute(
    'SELECT totp_secret, totp_pending_secret, totp_enabled FROM users WHERE id = ?',
    [userId]
  )
  const user = rows[0]

  // Compatibilidad: usuarios que generaron el QR antes de este cambio
  // tienen el secret sin confirmar directamente en totp_secret
  const pending = user?.totp_pending_secret ||
                  (!user?.totp_enabled ? user?.totp_secret : null)

  if (!pending) {
    return fail(res, 'Primero debe generar el QR con /2fa/setup', 400)
  }

  const valid = totpService.verifyTotpToken(pending, token)
  if (!valid) {
    return fail(res, 'Código inválido. Intente nuevamente', 401)
  }

  await pool.execute(
    `UPDATE users
     SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = TRUE
     WHERE id = ?`,
    [pending, userId]
  )

  await auditAuth(req, req.user, auditService.ACTIONS.TOTP_ENABLED,
    user.totp_enabled ? { cambio_de_dispositivo: true } : null)

  return ok(res, null, 'Autenticación de dos factores activada correctamente')
}

// ── Disable TOTP (requiere JWT) ───────────────────────────
const disableTOTP = async (req, res) => {
  const { token, password } = req.body
  const userId = req.user.id

  if (req.user.role === ROLES.ADMIN) {
    return fail(res, 'El administrador no puede desactivar el TOTP', 403)
  }

  const [rows] = await pool.execute(
    'SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = ?',
    [userId]
  )
  const user = rows[0]

  if (!user.totp_enabled) {
    return fail(res, 'El TOTP no está activo', 400)
  }

  const passwordOk = await authService.comparePassword(password, user.password_hash)
  if (!passwordOk) {
    return fail(res, 'Contraseña incorrecta', 401)
  }

  const valid = totpService.verifyTotpToken(user.totp_secret, token)
  if (!valid) {
    return fail(res, 'Código de autenticación inválido', 401)
  }

  await pool.execute(
    'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_pending_secret = NULL WHERE id = ?',
    [userId]
  )

  await auditAuth(req, req.user, auditService.ACTIONS.TOTP_DISABLED)

  return ok(res, null, 'Autenticación de dos factores desactivada')
}

// ── Initial Setup TOTP (sin JWT — primer login admin) ─────
const initialSetupTOTP = async (req, res) => {
  const { email, password } = req.body

  const user = await authModel.findByEmail(email)

  if (!user || !user.is_active || user.deleted_at) {
    return fail(res, 'Credenciales inválidas', 401)
  }

  const passwordOk = await authService.comparePassword(password, user.password_hash)
  if (!passwordOk) {
    return fail(res, 'Credenciales inválidas', 401)
  }

  if (user.role !== ROLES.ADMIN) {
    return fail(res, 'Esta ruta es solo para administradores', 403)
  }

  if (user.totp_enabled) {
    return fail(res, 'TOTP ya está configurado. Use /2fa/setup con su JWT', 400)
  }

  const secret          = totpService.generateSecret(user.email)
  const encryptedSecret = totpService.encryptSecret(secret)
  const qrCode          = await totpService.generateQR(secret, user.email)

  // Igual que /2fa/setup: queda pendiente hasta confirmar con un código
  await pool.execute(
    'UPDATE users SET totp_pending_secret = ? WHERE id = ?',
    [encryptedSecret, user.id]
  )

  return ok(res, { qrCode, manualCode: secret },
    'Escanee el QR con Google Authenticator o Authy y luego confirme con /2fa/initial-enable')
}

// ── Initial Enable TOTP (sin JWT — primer login admin) ────
const initialEnableTOTP = async (req, res) => {
  const { email, password, token } = req.body

  const user = await authModel.findByEmail(email)

  if (!user || !user.is_active) {
    return fail(res, 'Credenciales inválidas', 401)
  }

  const passwordOk = await authService.comparePassword(password, user.password_hash)
  if (!passwordOk) {
    return fail(res, 'Credenciales inválidas', 401)
  }

  if (user.role !== ROLES.ADMIN) {
    return fail(res, 'Esta ruta es solo para administradores', 403)
  }

  if (user.totp_enabled) {
    return fail(res, 'TOTP ya está activo', 400)
  }

  // Compatibilidad con QR generados antes del cambio (en totp_secret)
  const pending = user.totp_pending_secret || user.totp_secret
  if (!pending) {
    return fail(res, 'Primero ejecute /2fa/initial-setup', 400)
  }

  const valid = totpService.verifyTotpToken(pending, token)
  if (!valid) {
    return fail(res, 'Código inválido. Intente nuevamente', 401)
  }

  await pool.execute(
    `UPDATE users
     SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = TRUE
     WHERE id = ?`,
    [pending, user.id]
  )

  await auditAuth(req, user, auditService.ACTIONS.TOTP_ENABLED, { primer_ingreso: true })

  return ok(res, null, 'TOTP activado correctamente. Ya puede hacer login completo.')
}

module.exports = {
  login,
  verifyTOTPLogin,
  refreshToken,
  logout,
  setupTOTP,
  enableTOTP,
  disableTOTP,
  initialSetupTOTP,
  initialEnableTOTP
}