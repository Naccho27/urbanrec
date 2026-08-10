-- ─────────────────────────────────────────────────────────
-- 001c_create_login_attempts.sql
-- Registro de intentos de login para seguridad y auditoría.
-- Permite detectar ataques de fuerza bruta y mostrar
-- métricas de seguridad en el dashboard del administrador.
-- ─────────────────────────────────────────────────────────
CREATE TABLE login_attempts (
  id            BIGINT UNSIGNED   AUTO_INCREMENT PRIMARY KEY  COMMENT 'BIGINT por alto volumen de registros',
  email         VARCHAR(150)      NOT NULL                    COMMENT 'Email con el que se intentó el login. Se guarda aunque el usuario no exista',
  success       BOOLEAN           NOT NULL                    COMMENT 'TRUE = login exitoso. FALSE = credenciales o TOTP incorrectos',
  ip_address    VARCHAR(45)       NULL                        COMMENT 'IP del intento. VARCHAR(45) soporta IPv4 e IPv6',
  user_agent    TEXT              NULL                        COMMENT 'Navegador y sistema operativo del dispositivo',
  attempted_at  TIMESTAMP         DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha y hora exacta del intento',

  INDEX idx_email_date   (email, attempted_at)               COMMENT 'Detectar fuerza bruta por email',
  INDEX idx_success_date (success, attempted_at)             COMMENT 'Dashboard seguridad: intentos fallidos por período',
  INDEX idx_ip_date      (ip_address, attempted_at)          COMMENT 'Detectar ataques por IP'

) COMMENT = 'Historial de intentos de login. Usado para seguridad y auditoría de accesos';