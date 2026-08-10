'use strict'

const nodemailer = require('nodemailer')
const logger     = require('../../../shared/utils/logger')

// Crear transporter — en desarrollo usa un servicio de prueba
// En producción se configura con SMTP real en .env
let transporter

const getTransporter = () => {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })

  return transporter
}

const sendEmail = async ({ to, subject, html, text }) => {
  // Si no hay configuración SMTP, solo loggear en desarrollo
  if (!process.env.SMTP_USER) {
    logger.info(`[EMAIL SIMULADO] Para: ${to} | Asunto: ${subject}`)
    return true
  }

  try {
    const info = await getTransporter().sendMail({
      from:    `"Sistema Residuos VM" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text
    })
    logger.info(`Email enviado: ${info.messageId}`)
    return true
  } catch (err) {
    logger.error(`Error enviando email a ${to}: ${err.message}`)
    return false
  }
}

module.exports = { sendEmail }