-- ═════════════════════════════════════════════════════════
-- 004_create_collection_routes.sql
-- Recorridos de recolección definidos por el municipio.
--
-- Un recorrido es el trazado geográfico que debe seguir
-- un camión para recolectar residuos en una zona.
-- El municipio define el recorrido y lo asigna a una
-- empresa prestadora. La empresa asigna sus conductores.
--
-- Relaciones:
-- - Pertenece a una zona (zone_id)
-- - Tiene un tipo de residuo (waste_type_id)
-- - Está asignado a una empresa (company_id)
-- ═════════════════════════════════════════════════════════

CREATE TABLE collection_routes (

  -- ── Identificación ───────────────────────────────────
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del recorrido',
  name            VARCHAR(150)    NOT NULL                    COMMENT 'Nombre descriptivo. Ej: Recorrido Centro - General Mañana',
  description     TEXT            NULL                        COMMENT 'Observaciones operativas: calles incluidas, puntos de inicio y fin, restricciones',

  -- ── Relaciones principales ───────────────────────────
  zone_id         INT UNSIGNED    NOT NULL                    COMMENT 'Zona geográfica a la que pertenece este recorrido',
  waste_type_id   INT UNSIGNED    NOT NULL                    COMMENT 'Tipo de residuo que recolecta este recorrido',
  company_id      INT UNSIGNED    NULL                        COMMENT 'Empresa prestadora asignada por el municipio. NULL = recorrido creado pero sin empresa asignada todavía',

  -- ── Geometría del trazado ────────────────────────────
  geojson         JSON            NOT NULL                    COMMENT 'Trazado del recorrido en formato GeoJSON LineString: {"type":"LineString","coordinates":[[lng,lat],[lng,lat]...]}. Leaflet lo renderiza como línea en el mapa',

  -- ── Métricas estimadas ───────────────────────────────
  distance_km     DECIMAL(8,2)    NULL                        COMMENT 'Distancia total estimada del recorrido en kilómetros. Calculada a partir del GeoJSON',
  duration_min    INT UNSIGNED    NULL                        COMMENT 'Duración estimada del recorrido completo en minutos',

  -- ── Control ──────────────────────────────────────────
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE       COMMENT 'TRUE = recorrido activo. FALSE = desactivado, no aparece en cronogramas ni en el mapa',

  -- ── Trazabilidad ─────────────────────────────────────
  created_by      INT UNSIGNED    NOT NULL                    COMMENT 'Operador municipal que creó el recorrido',

  -- ── Auditoría ────────────────────────────────────────
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación del recorrido',
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (zone_id)
    REFERENCES zones(id)
    ON DELETE RESTRICT,           -- no se puede borrar una zona con recorridos activos

  FOREIGN KEY (waste_type_id)
    REFERENCES waste_types(id)
    ON DELETE RESTRICT,           -- no se puede borrar un tipo con recorridos activos

  FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE RESTRICT,           -- no se puede borrar una empresa con recorridos asignados

  FOREIGN KEY (created_by)
    REFERENCES users(id)
    ON DELETE RESTRICT,           -- no se puede borrar el operador que creó el recorrido

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_zone          (zone_id)       COMMENT 'Recorridos de una zona específica',
  INDEX idx_waste_type    (waste_type_id) COMMENT 'Recorridos por tipo de residuo',
  INDEX idx_company       (company_id)    COMMENT 'Recorridos asignados a una empresa',
  INDEX idx_active        (is_active)     COMMENT 'Filtrar solo recorridos activos',
  INDEX idx_zone_type     (zone_id, waste_type_id) COMMENT 'Recorridos de una zona para un tipo específico'

) COMMENT = 'Recorridos de recolección definidos por el municipio. Cada recorrido tiene un trazado GeoJSON, pertenece a una zona y está asignado a una empresa prestadora';