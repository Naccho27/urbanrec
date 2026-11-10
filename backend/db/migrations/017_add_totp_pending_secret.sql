-- ================================================================
-- 017_add_totp_pending_secret.sql
-- Secreto TOTP "pendiente de confirmación"
--
-- Antes, POST /auth/2fa/setup escribía el secreto nuevo directo en
-- totp_secret aunque el 2FA ya estuviera activo, sin pedir el código
-- vigente. Con una sesión robada, alguien podía vincular el 2FA a su
-- propio celular; y el usuario legítimo quedaba con su autenticador
-- inválido apenas se generaba el QR, aunque no terminara de configurar.
--
-- Ahora el secreto nuevo se guarda acá y recién reemplaza a
-- totp_secret cuando el usuario confirma con un código de la app
-- nueva (POST /2fa/enable o /2fa/initial-enable). Si nunca lo
-- confirma, el autenticador anterior sigue funcionando.
-- ================================================================

USE residuos_urbanos;

ALTER TABLE users
  ADD COLUMN totp_pending_secret VARCHAR(255) NULL
    COMMENT 'Secret TOTP nuevo (encriptado) generado por /2fa/setup y todavía no confirmado. Reemplaza a totp_secret al confirmar con un código válido'
    AFTER totp_secret;

-- Verificación
SHOW COLUMNS FROM users LIKE 'totp%';
