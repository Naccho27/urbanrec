-- ================================================================
-- 015_update_routes_realistic.sql
-- Duraciones y distancias realistas para los 5 recorridos de Cotreco
--
-- Los valores de la migración 014 se calcularon uniendo centroides
-- de barrios con una línea recta: eso mide cuánto tarda el camión en
-- CRUZAR los barrios, no en RECOLECTARLOS. En la recolección real el
-- camión recorre calle por calle a paso de hombre mientras los
-- recolectores bajan, buscan las bolsas y vuelven a subir, y además
-- hace al menos una descarga en el punto de disposición.
--
-- Criterio usado (supuestos a validar con Cotreco / Municipalidad):
--   - Velocidad media total: 4 a 7,5 km/h (avance y parada, incluye
--     la descarga; el Centro es el más lento)
--   - Duración total: entre 5 y 7 horas, dentro del turno de 8 h
--   - Incluye una descarga intermedia (~40 min ida, descarga, vuelta)
--   - El Centro es más lento por cuadra: mayor densidad de viviendas
--     y comercios, calles angostas y autos estacionados
--
-- También se ajusta valid_from de los cronogramas: la migración 014
-- los creó con CURDATE(), lo que haría que el histórico simulado
-- (abril–noviembre 2026) quede "antes" de que existiera el cronograma.
-- El escenario de simulación supone que estos cronogramas publicados
-- en el Geoportal ya regían desde el 1 de abril de 2026.
-- ================================================================

USE residuos_urbanos;

-- distance_km: kilómetros que recorre el camión calle por calle
-- duration_min: duración estimada (planificada) del recorrido completo
UPDATE collection_routes SET distance_km = 46.00, duration_min = 390
WHERE name = 'Recorrido Norte-Oeste - Residuos Domiciliarios';  -- 10 barrios, ~6 h 30 min

UPDATE collection_routes SET distance_km = 31.00, duration_min = 330
WHERE name = 'Recorrido Sur-Centro - Residuos Domiciliarios';   --  6 barrios, ~5 h 30 min

UPDATE collection_routes SET distance_km = 33.00, duration_min = 340
WHERE name = 'Recorrido Oeste - Residuos Domiciliarios';        --  6 barrios, ~5 h 40 min

UPDATE collection_routes SET distance_km = 22.00, duration_min = 330
WHERE name = 'Recorrido Centro - Residuos Domiciliarios';       --  4 barrios densos, ~5 h 30 min

UPDATE collection_routes SET distance_km = 52.00, duration_min = 405
WHERE name = 'Recorrido Este - Residuos Domiciliarios';         -- 12 barrios, ~6 h 45 min

-- Vigencia de los cronogramas desde el inicio del período simulado
UPDATE schedules s
INNER JOIN collection_routes cr ON cr.id = s.collection_route_id
SET s.valid_from = '2026-04-01'
WHERE cr.name LIKE 'Recorrido % - Residuos Domiciliarios'
  AND s.valid_from > '2026-04-01';

-- Verificación
SELECT cr.id, cr.name, cr.distance_km, cr.duration_min,
       ROUND(cr.distance_km / (cr.duration_min / 60), 1) AS km_h_promedio,
       s.id AS schedule_id, s.shift, s.week_days, s.valid_from
FROM collection_routes cr
INNER JOIN schedules s ON s.collection_route_id = cr.id
WHERE cr.name LIKE 'Recorrido % - Residuos Domiciliarios'
ORDER BY cr.id;
