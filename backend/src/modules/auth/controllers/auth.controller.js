'use strict'

const authModel    = require('../models/auth.model')
const authService  = require('../services/auth.service')
const totpService  = require('../services/totp.service')
const pool         = require('../../../config/db')
const { ok, fail } = require('../../../shared/utils/responses')
const { ROLES }    = require('../../../shared/utils/roles')

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
    return fail(res, 'Credenciales inválidas', 401)
  }

  const passwordOk = await authService.comparePassword(password, user.password_hash)
  if (!passwordOk) {
    await authModel.registerLoginAttempt({ email, success: false, ip, user_agent })
    return fail(res, 'Credenciales inválidas', 401)
  }

  if (user.totp_enabled) {
    await authModel.registerLoginAttempt({ email, success: false, ip, user_agent })
    return ok(res, { requiresTOTP: true, userId: user.id }, 'Se requiere código de autenticación', 200)
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

  return ok(res, {
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
const verifyTOTPLogin = async (req, res) => {
  const { userId, token } = req.body
  const ip         = req.ip
  const user_agent = req.headers['user-agent']

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
    return fail(res, 'Código de autenticación inválido o expirado', 401)
  }

  const payload      = authService.buildTokenPayload(user)
  const accessToken  = authService.signToken(payload)
  const refreshToken = authService.signRefreshToken(payload)

  // Setear cookies httpOnly
  setAuthCookies(res, accessToken, refreshToken)

  await authModel.registerLoginAttempt({ email: user.email, success: true, ip, user_agent })

  return ok(res, {
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
  res.clearCookie('accessToken')
  res.clearCookie('refreshToken')
  return ok(res, null, 'Sesión cerrada correctamente')
}

// ── Setup TOTP (requiere JWT) ─────────────────────────────
const setupTOTP = async (req, res) => {
  const userId = req.user.id
  const email  = req.user.email

  const secret          = totpService.generateSecret(email)
  const encryptedSecret = totpService.encryptSecret(secret)
  const qrCode          = await totpService.generateQR(secret, email)

  await pool.execute(
    'UPDATE users SET totp_secret = ? WHERE id = ?',
    [encryptedSecret, userId]
  )

  return ok(res, { qrCode, manualCode: secret },
    'QR generado. Escanee con Google Authenticator o Authy y confirme con un código')
}

// ── Enable TOTP (requiere JWT) ────────────────────────────
const enableTOTP = async (req, res) => {
  const { token } = req.body
  const userId    = req.user.id

  const [rows] = await pool.execute(
    'SELECT totp_secret FROM users WHERE id = ?',
    [userId]
  )
  const user = rows[0]

  if (!user || !user.totp_secret) {
    return fail(res, 'Primero debe configurar TOTP con /2fa/setup', 400)
  }

  const valid = totpService.verifyTotpToken(user.totp_secret, token)
  if (!valid) {
    return fail(res, 'Código inválido. Intente nuevamente', 401)
  }

  await pool.execute(
    'UPDATE users SET totp_enabled = TRUE WHERE id = ?',
    [userId]
  )

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
    'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?',
    [userId]
  )

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

  await pool.execute(
    'UPDATE users SET totp_secret = ? WHERE id = ?',
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

  if (!user.totp_secret) {
    return fail(res, 'Primero ejecute /2fa/initial-setup', 400)
  }

  if (user.totp_enabled) {
    return fail(res, 'TOTP ya está activo', 400)
  }

  const valid = totpService.verifyTotpToken(user.totp_secret, token)
  if (!valid) {
    return fail(res, 'Código inválido. Intente nuevamente', 401)
  }

  await pool.execute(
    'UPDATE users SET totp_enabled = TRUE WHERE id = ?',
    [user.id]
  )

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