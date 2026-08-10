'use strict'

const { authenticator } = require('otplib')
const QRCode            = require('qrcode')
const crypto            = require('crypto')
const { totp }          = require('../../../config/env')

// Configuración de otplib
// window: acepta códigos del período anterior/siguiente
// para tolerancia de desfase de reloj
// acepta hasta 4 períodos (acepta códigos de hasta 2 minutos de diferencia)
// volver 1 en produccion
authenticator.options = {
  window: 4
}

// Algoritmo y clave para encriptar el secret TOTP
// antes de guardarlo en la DB
const ALGORITHM  = 'aes-256-cbc'
const KEY_BUFFER = Buffer.from(totp.encryptionKey.padEnd(32).slice(0, 32))

// Encripta el secret TOTP con AES-256-CBC
// antes de guardarlo en la columna totp_secret de users
const encryptSecret = (secret) => {
  const iv         = crypto.randomBytes(16)
  const cipher     = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv)
  const encrypted  = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ])
  // Guardamos iv + encrypted juntos en formato hex separados por ':'
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

// Desencripta el secret almacenado en la DB
const decryptSecret = (encryptedData) => {
  const [ivHex, encryptedHex] = encryptedData.split(':')
  const iv        = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher  = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv)
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
  return decrypted.toString('utf8')
}

// Genera un secret TOTP único para el usuario
const generateSecret = (userEmail) => {
  return authenticator.generateSecret()
}

// Genera el QR en base64 para mostrar en el frontend
// El usuario lo escanea con Google Authenticator o Authy
const generateQR = async (secret, userEmail) => {
  const otpAuthUrl = authenticator.keyuri(
    userEmail,
    'Residuos Urbanos Villa María',
    secret
  )
  // Retorna el QR como string base64 para enviarlo al frontend
  return QRCode.toDataURL(otpAuthUrl)
}

// Verifica si el código de 6 dígitos ingresado por el usuario
// coincide con el secret almacenado
// Retorna true si es válido, false si no
const verifyTotpToken = (encryptedSecret, token) => {
  try {
    const secret = decryptSecret(encryptedSecret)
    
    // Ver qué código espera el servidor ahora mismo
    const expectedToken = authenticator.generate(secret)
    console.log('Secret:', secret)
    console.log('Token recibido:', token)
    console.log('Token esperado por el servidor:', expectedToken)
    console.log('Hora del servidor:', new Date().toISOString())
    
    return authenticator.verify({ token, secret })
  } catch (err) {
    console.log('Error:', err.message)
    return false
  }
}


module.exports = {
  generateSecret,
  generateQR,
  encryptSecret,
  decryptSecret,
  verifyTotpToken
}