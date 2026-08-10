-- ═════════════════════════════════════════════════════════
-- 006_create_route_executions.sql
-- Ejecuciones diarias de los recorridos.
--
-- Una ejecución es la instancia real de un recorrido
-- en un día y turno específico. Es el registro operativo
-- de lo que realmente pasó vs lo que estaba programado.
--
-- Ejemplo:
-- Schedule: Recorrido Centro - General, lunes y miércoles, mañana
-- Execution: Recorrido Centro - General, lunes 02/06/2026, mañana
--            → iniciado 06:12, completado 09:47, 94% completitud
--
-- Esta tabla es el corazón operativo del sistema.
-- De acá se alimentan analytics, auditoría y el
-- dashboard en tiempo real del operador municipal.
-- ═════════════════════════════════════════════════════════

CREATE TABLE route_executions (

  -- ── Identificación ───────────────────────────────────
  id                    INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la ejecución',

  -- ── Origen ───────────────────────────────────────────
  schedule_id           INT UNSIGNED    NOT NULL                    COMMENT 'Cronograma que originó esta ejecución',
  collection_route_id   INT UNSIGNED    NOT NULL                    COMMENT 'Recorrido que se está ejecutando. Redundante con schedule pero acelera queries directas',
  company_id            INT UNSIGNED    NOT NULL                    COMMENT 'Empresa prestadora que ejecuta el recorrido. Para aislamiento de datos por empresa',
  conductor_id          INT UNSIGNED    NULL                        COMMENT 'Conductor asignado por el operador empresa. NULL = aún no asignado (estado pending o assigned sin conductor)',

  -- ── Fecha ────────────────────────────────────────────
  execution_date        DATE            NOT NULL                    COMMENT 'Fecha en que se ejecuta o ejecutó el recorrido',

  -- ── Estado ───────────────────────────────────────────
  status                ENUM(
                          'pending',      -- programado, esperando asignación de conductor
                          'assigned',     -- conductor asignado, aún no inició
                          'in_progress',  -- conductor inició el recorrido
                          'paused',       -- conductor pausó el recorrido (corte de calle, incidente)
                          'completed',    -- recorrido finalizado correctamente
                          'cancelled',    -- recorrido cancelado antes de iniciar
                          'with_issues'   -- finalizado pero con incidencias registradas
                        ) NOT NULL DEFAULT 'pending'               COMMENT 'Estado actual de la ejecución. Avanza en orden lógico. El conductor lo controla desde la PWA',

  -- ── Tiempos reales ───────────────────────────────────
  started_at            TIMESTAMP       NULL                        COMMENT 'Momento exacto en que el conductor inició el recorrido desde la PWA',
  paused_at             TIMESTAMP       NULL                        COMMENT 'Momento en que se pausó por última vez',
  completed_at          TIMESTAMP       NULL                        COMMENT 'Momento en que el conductor finalizó el recorrido',

  -- ── Métricas de completitud ──────────────────────────
  completion_pct        DECIMAL(5,2)    NOT NULL DEFAULT 0.00      COMMENT 'Porcentaje de zonas visitadas sobre el total. 0.00 a 100.00. Calculado automáticamente al marcar zonas',
  zones_total           INT UNSIGNED    NULL                        COMMENT 'Total de zonas que tiene el recorrido. Se copia al crear la ejecución para no depender del recorrido original',
  zones_visited         INT UNSIGNED    NOT NULL DEFAULT 0          COMMENT 'Cantidad de zonas efectivamente visitadas durante la ejecución',

  -- ── Distancia real ───────────────────────────────────
  distance_covered_km   DECIMAL(8,2)    NULL                        COMMENT 'Kilómetros reales recorridos calculados a partir de los puntos GPS registrados',

  -- ── Observaciones ────────────────────────────────────
  notes                 TEXT            NULL                        COMMENT 'Observaciones del conductor o del operador sobre esta ejecución',

  -- ── Auditoría ────────────────────────────────────────
  created_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación del registro de ejecución',
  updated_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (schedule_id)
    REFERENCES schedules(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (collection_route_id)
    REFERENCES collection_routes(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (conductor_id)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_schedule      (schedule_id)                           COMMENT 'Ejecuciones de un cronograma específico',
  INDEX idx_route         (collection_route_id)                   COMMENT 'Ejecuciones de un recorrido específico',
  INDEX idx_company       (company_id)                            COMMENT 'Ejecuciones de una empresa — aislamiento de datos',
  INDEX idx_conductor     (conductor_id)                          COMMENT 'Ejecuciones de un conductor específico',
  INDEX idx_date          (execution_date)                        COMMENT 'Ejecuciones de un día específico',
  INDEX idx_status        (status)                                COMMENT 'Filtrar por estado: in_progress para el mapa en tiempo real',
  INDEX idx_company_date  (company_id, execution_date)            COMMENT 'Query más común del operador empresa: mis ejecuciones de hoy',
  INDEX idx_company_status (company_id, status)                   COMMENT 'Ejecuciones en curso de una empresa para el mapa en tiempo real',
  INDEX idx_date_status   (execution_date, status)                COMMENT 'Todas las ejecuciones activas hoy para el dashboard municipal'

) COMMENT = 'Ejecuciones diarias de los recorridos. Registro operativo de lo que realmente ocurrió. Alimenta analytics, auditoría y tiempo real';