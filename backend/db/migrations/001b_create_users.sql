-- ─────────────────────────────────────────────────────────
-- 001b_create_users.sql
-- Usuarios del sistema con soporte para todos los roles
-- incluyendo el rol operator_company.
-- TOTP integrado desde el inicio para admin y municipal.
-- ─────────────────────────────────────────────────────────
CREATE TABLE users (
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del usuario',
  name            VARCHAR(100)    NOT NULL                    COMMENT 'Nombre completo',
  email           VARCHAR(150)    NOT NULL UNIQUE             COMMENT 'Email usado como identificador de login. Único en el sistema',
  password_hash   VARCHAR(255)    NOT NULL                    COMMENT 'Contraseña hasheada con bcrypt rounds=12. Nunca en texto plano',

  role            ENUM(
                    'admin',
                    'municipal',
                    'operator_company',
                    'conductor',
                    'citizen'
                  ) NOT NULL DEFAULT 'citizen'               COMMENT 'Rol del usuario. ej: admin=TI municipal, municipal=Subsecretaría, operator_company=supervisor Cotreco, conductor=chofer, citizen=vecino',

  company_id      INT UNSIGNED    NULL                        COMMENT 'Empresa a la que pertenece. Solo para operator_company y conductor. NULL para admin, municipal y citizen',

  phone           VARCHAR(30)     NULL                        COMMENT 'Teléfono de contacto. Útil para coordinación operativa',
  avatar_url      VARCHAR(500)    NULL                        COMMENT 'URL de foto de perfil en Cloudinary. NULL si no tiene foto',

  -- Datos específicos del conductor (NULL para otros roles)
  dni             VARCHAR(15)     NULL                        COMMENT 'DNI del conductor. NULL para otros roles',
  license_number  VARCHAR(30)     NULL                        COMMENT 'Número de licencia profesional del conductor. NULL para otros roles',
  license_expiry  DATE            NULL                        COMMENT 'Vencimiento de la licencia. Permite alertas preventivas. NULL para otros roles',

  -- TOTP — obligatorio para admin, opcional para municipal
  totp_secret     VARCHAR(255)    NULL                        COMMENT 'Secret TOTP encriptado con AES. Usado para verificar códigos de Google Authenticator o Authy',
  totp_enabled    BOOLEAN         NOT NULL DEFAULT FALSE      COMMENT 'TRUE = login requiere código TOTP además de contraseña',

  is_active       BOOLEAN         NOT NULL DEFAULT TRUE       COMMENT 'TRUE = cuenta activa. FALSE = desactivada por el admin, no puede hacer login',
  deleted_at      TIMESTAMP       NULL                        COMMENT 'Soft delete: fecha de desactivación. NULL = cuenta vigente. No se borra para preservar historial',

  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación de la cuenta',
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,

  INDEX idx_email          (email)                           COMMENT 'Búsqueda rápida por email en el login',
  INDEX idx_role           (role)                            COMMENT 'Filtrado por rol en el panel admin',
  INDEX idx_company        (company_id)                      COMMENT 'Filtrado de usuarios por empresa',
  INDEX idx_role_active    (role, is_active)                 COMMENT 'Query más común: conductores activos de una empresa',
  INDEX idx_license_expiry (license_expiry)                  COMMENT 'Alertas de vencimiento de licencia'

) COMMENT = 'Usuarios del sistema. El rol determina permisos, el company_id determina aislamiento de datos';

INSERT INTO users (name, email, password_hash, role, is_active)
VALUES (
  'Administrador',
  'admin@villamaria.gob.ar',
  '$2a$12$deZI669X1/C34kQWJ0LfuuL68olRBhypA1n3l2LpQiFtm1VyFoPAC',
  'admin',
  TRUE
);