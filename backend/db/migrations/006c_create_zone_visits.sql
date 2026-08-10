-- ═════════════════════════════════════════════════════════
-- 006c_create_zone_visits.sql
-- Registro de zonas visitadas dentro de una ejecución.
--
-- Cuando el camión pasa cerca del centroide de una zona
-- (dentro del radio configurado en system_settings),
-- el sistema registra automáticamente la visita.
-- El conductor también puede marcarla manualmente
-- si el GPS no la detectó.
--
-- Esta tabla alimenta el cálculo de completion_pct
-- en route_executions y el mapa del operador municipal.
-- ═════════════════════════════════════════════════════════

CREATE TABLE zone_visits (

  -- ── Identificación ───────────────────────────────────
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la visita',

  -- ── Contexto ─────────────────────────────────────────
  execution_id  INT UNSIGNED    NOT NULL                    COMMENT 'Ejecución durante la cual se visitó la zona',
  zone_id       INT UNSIGNED    NOT NULL                    COMMENT 'Zona que fue visitada',

  -- ── Método de confirmación ───────────────────────────
  method        ENUM(
                  'auto',       -- marcada automáticamente por proximidad GPS
                  'manual'      -- marcada manualmente por el conductor desde la PWA
                ) NOT NULL DEFAULT 'auto'                   COMMENT 'Cómo se confirmó la visita. Auto = GPS detectó proximidad al centroide. Manual = conductor la marcó porque el GPS no la detectó',

  -- ── Timestamp ────────────────────────────────────────
  visited_at    TIMESTAMP       NOT NULL                    COMMENT 'Momento en que se confirmó la visita a la zona',

  -- ── Observaciones ────────────────────────────────────
  notes         TEXT            NULL                        COMMENT 'Observación opcional del conductor sobre la visita a esta zona',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (execution_id)
    REFERENCES route_executions(id)
    ON DELETE CASCADE,            -- si se borra la ejecución, se borran sus visitas

  FOREIGN KEY (zone_id)
    REFERENCES zones(id)
    ON DELETE RESTRICT,           -- no se puede borrar una zona con visitas registradas

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_execution       (execution_id)              COMMENT 'Zonas visitadas en una ejecución específica',
  INDEX idx_zone            (zone_id)                   COMMENT 'Historial de visitas a una zona',
  INDEX idx_execution_zone  (execution_id, zone_id)     COMMENT 'Verificar si una zona ya fue visitada en esta ejecución',
  INDEX idx_method          (method)                    COMMENT 'Analizar proporción de visitas automáticas vs manuales'

) COMMENT = 'Registro de zonas visitadas durante cada ejecución. Alimenta el porcentaje de completitud y el mapa en tiempo real';