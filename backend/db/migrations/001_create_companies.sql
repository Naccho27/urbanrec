CREATE TABLE companies (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la empresa',
  name        VARCHAR(150)    NOT NULL                    COMMENT 'Razón social. Ej: Cotreco S.A.',
  cuit        VARCHAR(13)     NULL UNIQUE                 COMMENT 'CUIT en formato XX-XXXXXXXX-X',
  email       VARCHAR(150)    NULL                        COMMENT 'Email de contacto operativo',
  phone       VARCHAR(30)     NULL                        COMMENT 'Teléfono de contacto',
  address     TEXT            NULL                        COMMENT 'Dirección física o sede operativa',
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE       COMMENT 'TRUE = activa. FALSE = desactivada, historial conservado',
  created_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de registro en el sistema',
  updated_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación'
) COMMENT = 'Empresas prestadoras del servicio de recolección de residuos';

INSERT INTO companies (name, is_active)
VALUES ('Cotreco S.A.', TRUE);