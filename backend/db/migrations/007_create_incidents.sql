-- ═════════════════════════════════════════════════════════
-- 007_create_incidents.sql
-- Incidentes operativos reportados por los conductores.
--
-- El conductor reporta desde la PWA sin interrumpir
-- el recorrido. El operador empresa ve sus incidentes,
-- el operador municipal ve todos.
--
-- Ejemplos reales en Villa María:
-- - Calle cortada por obra en barrio Sarmiento
-- - Zona inaccesible por auto mal estacionado
-- - Sin residuos en veredas (vecinos no sacaron)
-- - Problema con el camión (mecánico)
-- ═════════════════════════════════════════════════════════

CREATE TABLE incidents (

  -- ── Identificación ───────────────────────────────────
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del incidente',

  -- ── Contexto operativo ───────────────────────────────
  execution_id    INT UNSIGNED    NOT NULL                    COMMENT 'Ejecución durante la cual ocurrió el incidente',
  conductor_id    INT UNSIGNED    NOT NULL                    COMMENT 'Conductor que reportó el incidente',
  company_id      INT UNSIGNED    NOT NULL                    COMMENT 'Empresa del conductor. Para aislamiento de datos: operador empresa solo ve sus incidentes',
  zone_id         INT UNSIGNED    NULL                        COMMENT 'Zona donde ocurrió el incidente. NULL si ocurrió entre zonas o no aplica',

  -- ── Clasificación ────────────────────────────────────
  type            ENUM(
                    'blocked_street',     -- calle cortada por obra, accidente o evento
                    'inaccessible_zone',  -- zona inaccesible (auto mal estacionado, etc.)
                    'no_waste',           -- vecinos no sacaron los residuos
                    'vehicle_issue',      -- problema mecánico o técnico del camión
                    'weather',            -- condiciones climáticas que impiden el servicio
                    'other'               -- otro tipo de incidente
                  ) NOT NULL                                  COMMENT 'Tipo de incidente. Permite filtrar y analizar por categoría',

  -- ── Detalle ──────────────────────────────────────────
  description     TEXT            NOT NULL                    COMMENT 'Descripción del incidente escrita por el conductor',

  -- ── Ubicación del incidente ──────────────────────────
  latitude        DECIMAL(10,7)   NULL                        COMMENT 'Latitud donde ocurrió el incidente. Tomada del GPS del conductor al momento del reporte',
  longitude       DECIMAL(10,7)   NULL                        COMMENT 'Longitud donde ocurrió el incidente',

  -- ── Evidencia ────────────────────────────────────────
  photo_url       VARCHAR(500)    NULL                        COMMENT 'URL de foto adjunta almacenada en Cloudinary. NULL si no hay foto',

  -- ── Estado y resolución ──────────────────────────────
  status          ENUM(
                    'open',       -- reportado, pendiente de atención
                    'reviewing',  -- el operador municipal lo está analizando
                    'resolved'    -- resuelto, con o sin acción tomada
                  ) NOT NULL DEFAULT 'open'                   COMMENT 'Estado del incidente. El operador municipal lo gestiona',

  resolved_by     INT UNSIGNED    NULL                        COMMENT 'Operador municipal que marcó el incidente como resuelto. NULL si aún no está resuelto',
  resolved_at     TIMESTAMP       NULL                        COMMENT 'Momento en que se marcó como resuelto',
  resolution_notes TEXT           NULL                        COMMENT 'Descripción de la acción tomada para resolver el incidente',

  -- ── Auditoría ────────────────────────────────────────
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Momento en que el conductor reportó el incidente',
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (execution_id)
    REFERENCES route_executions(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (conductor_id)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (zone_id)
    REFERENCES zones(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (resolved_by)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_execution     (execution_id)              COMMENT 'Incidentes de una ejecución específica',
  INDEX idx_conductor     (conductor_id)              COMMENT 'Incidentes reportados por un conductor',
  INDEX idx_company       (company_id)                COMMENT 'Incidentes de una empresa — aislamiento de datos',
  INDEX idx_zone          (zone_id)                   COMMENT 'Incidentes en una zona específica — analytics por zona',
  INDEX idx_type          (type)                      COMMENT 'Filtrar por tipo de incidente',
  INDEX idx_status        (status)                    COMMENT 'Incidentes abiertos pendientes de resolución',
  INDEX idx_company_status (company_id, status)       COMMENT 'Incidentes abiertos de una empresa específica',
  INDEX idx_created       (created_at)                COMMENT 'Incidentes por período de tiempo'

) COMMENT = 'Incidentes operativos reportados por conductores durante las ejecuciones. El operador empresa ve los suyos, el municipal ve todos';