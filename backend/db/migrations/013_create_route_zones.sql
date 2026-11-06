-- ════════════════════════════════════════════════════════════════
-- 013_create_route_zones.sql
-- Relación muchos a muchos entre recorridos y zonas.
--
-- MOTIVO DEL CAMBIO
-- El modelo original asumía que un recorrido cubría una sola zona
-- (collection_routes.zone_id). La operación real de Cotreco no funciona
-- así: la empresa ejecuta 5 recorridos que cubren los 38 barrios de
-- Villa María, agrupando varias zonas en cada salida del camión.
--
-- Mantener zone_id obligaba a crear 38 recorridos ficticios y rompía
-- el cálculo de completitud (zones_total siempre valdría 1).
--
-- IMPACTO
-- - Se crea la tabla route_zones con el orden de visita
-- - Se migran los recorridos existentes (1 zona cada uno)
-- - Se elimina collection_routes.zone_id
--
-- El campo visit_order deja preparado el terreno para que el módulo
-- de IA (OR-Tools / VRP) optimice el orden de visita de las zonas.
-- ════════════════════════════════════════════════════════════════

USE residuos_urbanos;

-- ── 1. Crear la tabla de relación ───────────────────────────────

CREATE TABLE route_zones (

  collection_route_id INT UNSIGNED  NOT NULL
                      COMMENT 'Recorrido que cubre esta zona',

  zone_id             INT UNSIGNED  NOT NULL
                      COMMENT 'Zona incluida en el recorrido',

  visit_order         INT UNSIGNED  NULL
                      COMMENT 'Orden de visita de la zona dentro del recorrido (1 = primera). NULL si el orden no está definido. Lo optimiza el módulo de IA con OR-Tools',

  -- Clave compuesta: una zona no puede repetirse en el mismo recorrido
  PRIMARY KEY (collection_route_id, zone_id),

  -- Si se elimina el recorrido se eliminan sus asociaciones
  FOREIGN KEY (collection_route_id)
    REFERENCES collection_routes(id)
    ON DELETE CASCADE,

  -- No se puede eliminar una zona que forma parte de un recorrido
  FOREIGN KEY (zone_id)
    REFERENCES zones(id)
    ON DELETE RESTRICT,

  INDEX idx_zone         (zone_id)
                         COMMENT 'Buscar en qué recorridos aparece una zona',

  INDEX idx_route_order  (collection_route_id, visit_order)
                         COMMENT 'Listar las zonas de un recorrido en orden de visita'

) COMMENT = 'Relación recorrido-zona. Un recorrido cubre varias zonas en una misma salida, y una zona puede estar en varios recorridos (uno por tipo de residuo)';


-- ── 2. Migrar los recorridos existentes ─────────────────────────
-- Cada recorrido actual tiene exactamente una zona: se preserva
-- como primera (y única) parada del recorrido.

INSERT INTO route_zones (collection_route_id, zone_id, visit_order)
SELECT id, zone_id, 1
FROM collection_routes
WHERE zone_id IS NOT NULL;


-- ── 3. Eliminar la columna zone_id ──────────────────────────────
-- Se elimina en lugar de conservarla como "zona principal" para
-- evitar que futuras queries la usen pensando que es la única zona
-- del recorrido, que es precisamente el error que se está corrigiendo.

ALTER TABLE collection_routes
  DROP FOREIGN KEY collection_routes_ibfk_1;

ALTER TABLE collection_routes
  DROP COLUMN zone_id;


-- ── Verificación ────────────────────────────────────────────────

-- La columna zone_id ya no debe aparecer
SHOW COLUMNS FROM collection_routes;

-- Los recorridos existentes deben conservar sus zonas
SELECT
  cr.id,
  cr.name,
  COUNT(rz.zone_id) AS zonas_asignadas
FROM collection_routes cr
LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
GROUP BY cr.id
ORDER BY cr.id;