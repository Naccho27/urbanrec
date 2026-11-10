'use strict'

// Tests del flujo de reconfiguración del 2FA (POST /auth/2fa/setup
// y /2fa/enable): con el 2FA activo hay que probar ambos factores, y
// el secret nuevo no reemplaza al activo hasta confirmarlo.

const { describe, test, mock, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { pool, load } = require('../helpers/setup')

const authService    = load('modules/auth/services/auth.service')
const totpService    = load('modules/auth/services/totp.service')
const auditService   = load('modules/audit/services/audit.service')
const authController = load('modules/auth/controllers/auth.controller')

afterEach(() => mock.restoreAll())

// Respuesta de Express falsa: guarda el código y el cuerpo
const fakeRes = () => {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.cookie = () => res
  return res
}

const fakeReq = (body = {}) => ({
  user: { id: 6, email: 'mfernandez@villamaria.gob.ar', role: 'municipal', company_id: null },
  body,
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test' }
})

// Usuario en la base falsa + registro de las escrituras que se hagan
const fakeUser = (user) => {
  const writes = []
  mock.method(pool, 'execute', async (sql, params) => {
    if (sql.trim().startsWith('UPDATE')) { writes.push({ sql, params }); return [{}] }
    return [[user]]
  })
  mock.method(auditService, 'record', async () => {})
  return writes
}

describe('POST /2fa/setup con el 2FA ya activo', () => {
  const ACTIVE = { password_hash: 'hash', totp_secret: 'secret-activo', totp_enabled: 1 }

  test('sin contraseña ni código: 400 y no genera nada', async () => {
    const writes = fakeUser(ACTIVE)
    const res = fakeRes()
    await authController.setupTOTP(fakeReq(), res)
    assert.equal(res.statusCode, 400)
    assert.equal(writes.length, 0)
  })

  test('contraseña incorrecta: 401', async () => {
    const writes = fakeUser(ACTIVE)
    mock.method(authService, 'comparePassword', async () => false)
    const res = fakeRes()
    await authController.setupTOTP(fakeReq({ password: 'mala', token: '123456' }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(writes.length, 0)
  })

  test('código actual incorrecto: 401', async () => {
    const writes = fakeUser(ACTIVE)
    mock.method(authService, 'comparePassword', async () => true)
    mock.method(totpService, 'verifyTotpToken', () => false)
    const res = fakeRes()
    await authController.setupTOTP(fakeReq({ password: 'ok', token: '123456' }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(writes.length, 0)
  })

  test('con ambos factores: guarda el secret nuevo como PENDIENTE', async () => {
    const writes = fakeUser(ACTIVE)
    mock.method(authService, 'comparePassword', async () => true)
    mock.method(totpService, 'verifyTotpToken', () => true)
    const res = fakeRes()
    await authController.setupTOTP(fakeReq({ password: 'ok', token: '123456' }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(writes.length, 1)
    assert.match(writes[0].sql, /totp_pending_secret = \?/)
    assert.doesNotMatch(writes[0].sql, /totp_secret = \?/)   // el activo no se toca
  })
})

describe('POST /2fa/setup por primera vez', () => {
  test('no pide credenciales y deja el secret pendiente', async () => {
    const writes = fakeUser({ password_hash: 'hash', totp_secret: null, totp_enabled: 0 })
    const res = fakeRes()
    await authController.setupTOTP(fakeReq(), res)
    assert.equal(res.statusCode, 200)
    assert.match(writes[0].sql, /totp_pending_secret/)
  })
})

describe('POST /2fa/enable', () => {
  test('con código válido pasa el pendiente a activo', async () => {
    const writes = fakeUser({ totp_secret: 'viejo', totp_pending_secret: 'nuevo', totp_enabled: 1 })
    const verify = mock.method(totpService, 'verifyTotpToken', () => true)
    const res = fakeRes()
    await authController.enableTOTP(fakeReq({ token: '123456' }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(verify.mock.calls[0].arguments[0], 'nuevo')    // se valida contra el nuevo
    assert.deepEqual(writes[0].params, ['nuevo', 6])
    assert.match(writes[0].sql, /totp_pending_secret = NULL/)
  })

  test('con código inválido no cambia nada', async () => {
    const writes = fakeUser({ totp_secret: 'viejo', totp_pending_secret: 'nuevo', totp_enabled: 1 })
    mock.method(totpService, 'verifyTotpToken', () => false)
    const res = fakeRes()
    await authController.enableTOTP(fakeReq({ token: '000000' }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(writes.length, 0)
  })

  test('sin QR generado: 400', async () => {
    fakeUser({ totp_secret: 'viejo', totp_pending_secret: null, totp_enabled: 1 })
    const res = fakeRes()
    await authController.enableTOTP(fakeReq({ token: '123456' }), res)
    assert.equal(res.statusCode, 400)
  })
})
