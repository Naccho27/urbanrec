-- ═════════════════════════════════════════════════════════
-- 011_create_ai_suggestions.sql
-- Sugerencias generadas por los modelos de IA.
--
-- El módulo de IA (FastAPI + Python) genera dos tipos
-- de sugerencias:
-- 1. Optimización de rutas (OR-Tools VRP)
--    → propone recorridos más eficientes
-- 2. Predicción de demanda (scikit-learn)
--    → estima variaciones por zona y período
--
-- Las sugerencias no se aplican automáticamente.
-- El operador municipal las revisa, las evalúa
-- comparando con los recorridos actuales y decide
-- si aprobarlas o rechazarlas. Toda decisión queda
-- registrada en audit_logs.
-- ═════════════════════════════════════════════════════════

CREATE TABLE ai_suggestions (

  -- ── Identificación ───────────────────────────────────
  id                    INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la sugerencia',

  -- ── Tipo de sugerencia ───────────────────────────────
  type                  ENUM(
                          'route_optimization',   -- sugerencia de ruta más eficiente (OR-Tools)
                          'demand_prediction'     -- predicción de demanda por zona (scikit-learn)
                        ) NOT NULL                                  COMMENT 'Tipo de análisis que generó la sugerencia',

  -- ── Contexto ─────────────────────────────────────────
  collection_route_id   INT UNSIGNED    NULL                        COMMENT 'Recorrido afectado por la sugerencia. NULL para predicciones de demanda generales',
  zone_id               INT UNSIGNED    NULL                        COMMENT 'Zona afectada. NULL para sugerencias que aplican a múltiples zonas',

  -- ── Datos del modelo ─────────────────────────────────
  input_data            JSON            NOT NULL                    COMMENT 'Datos de entrada que se enviaron al modelo de IA. Permite reproducir el análisis y auditar qué información usó',
  output_data           JSON            NOT NULL                    COMMENT 'Resultado completo generado por el modelo. Para optimización: rutas propuestas con métricas. Para predicción: proyecciones por zona y período',

  -- ── Resumen legible ──────────────────────────────────
  summary               TEXT            NOT NULL                    COMMENT 'Resumen en lenguaje natural para el operador municipal. Ej: Se detectó que el recorrido Centro-General puede reducir 12km eliminando tramos redundantes entre calles X e Y',

  -- ── Métricas de mejora ───────────────────────────────
  estimated_savings_km  DECIMAL(8,2)    NULL                        COMMENT 'Kilómetros estimados que se ahorrarían aplicando la sugerencia. Solo para route_optimization',
  estimated_savings_min INT UNSIGNED    NULL                        COMMENT 'Minutos estimados que se ahorrarían por recorrido. Solo para route_optimization',

  -- ── Estado de revisión ───────────────────────────────
  status                ENUM(
                          'pending',    -- generada, esperando revisión del operador municipal
                          'approved',   -- operador municipal aprobó aplicar la sugerencia
                          'rejected'    -- operador municipal rechazó la sugerencia
                        ) NOT NULL DEFAULT 'pending'               COMMENT 'Estado de la revisión. El operador municipal aprueba o rechaza. Nunca se aplica automáticamente',

  -- ── Revisión ─────────────────────────────────────────
  reviewed_by           INT UNSIGNED    NULL                        COMMENT 'Operador municipal que revisó la sugerencia. NULL si aún está pendiente',
  reviewed_at           TIMESTAMP       NULL                        COMMENT 'Momento en que se revisó la sugerencia',
  review_notes          TEXT            NULL                        COMMENT 'Comentario del operador sobre por qué aprobó o rechazó la sugerencia',

  -- ── Auditoría ────────────────────────────────────────
  generated_at          TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Momento en que el modelo de IA generó la sugerencia',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (collection_route_id)
    REFERENCES collection_routes(id)
    ON DELETE SET NULL,           -- si se borra el recorrido, la sugerencia queda huérfana pero se conserva

  FOREIGN KEY (zone_id)
    REFERENCES zones(id)
    ON DELETE SET NULL,

  FOREIGN KEY (reviewed_by)
    REFERENCES users(id)
    ON DELETE SET NULL,

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_type          (type)                      COMMENT 'Filtrar por tipo de sugerencia',
  INDEX idx_status        (status)                    COMMENT 'Sugerencias pendientes de revisión',
  INDEX idx_route         (collection_route_id)       COMMENT 'Sugerencias sobre un recorrido específico',
  INDEX idx_zone          (zone_id)                   COMMENT 'Sugerencias sobre una zona específica',
  INDEX idx_generated     (generated_at)              COMMENT 'Sugerencias por período de generación',
  INDEX idx_reviewed_by   (reviewed_by)               COMMENT 'Sugerencias revisadas por un operador específico'

) COMMENT = 'Sugerencias generadas por los modelos de IA. Nunca se aplican automáticamente — requieren revisión y aprobación del operador municipal';