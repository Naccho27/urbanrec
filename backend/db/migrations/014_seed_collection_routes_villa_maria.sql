-- ================================================================
-- 014_seed_collection_routes_villa_maria.sql
-- Recorridos reales de Cotreco S.A. segun el Geoportal Municipal
--
-- Cotreco opera 5 recorridos que cubren los 38 barrios de la ciudad.
-- Cada recorrido agrupa varias zonas en una misma salida, por eso
-- la relacion recorrido-zona es muchos a muchos (tabla route_zones).
--
-- El trazado GeoJSON conecta los centroides de las zonas en orden
-- de visita (heuristica del vecino mas cercano). Es un trazado
-- preliminar: el operador municipal puede reemplazarlo por el
-- recorrido real calle por calle desde el panel.
-- ================================================================

USE residuos_urbanos;

-- ---- Recorrido 1: Recorrido Norte-Oeste - Residuos Domiciliarios (10 zonas) ----
INSERT INTO collection_routes
  (name, description, waste_type_id, company_id, geojson, distance_km, duration_min, is_active, created_by)
VALUES (
  'Recorrido Norte-Oeste - Residuos Domiciliarios',
  'Recorrido de residuos domiciliarios urbanos. Cubre 10 barrios. Fuente: Geoportal Municipal Villa Maria (Cotreco S.A.).',
  1,
  1,
  '{"type": "LineString", "coordinates": [[-63.247152, -32.390901], [-63.254109, -32.396397], [-63.258066, -32.391751], [-63.257782, -32.401246], [-63.274635, -32.407341], [-63.271396, -32.413312], [-63.263855, -32.418298], [-63.290668, -32.415985], [-63.2334, -32.390906], [-63.221979, -32.394953]]}',
  15.69,
  118,
  TRUE,
  1
);
SET @r1 = LAST_INSERT_ID();

INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 1 FROM zones WHERE name = 'PARQUE NORTE';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 2 FROM zones WHERE name = 'MANUEL BELGRANO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 3 FROM zones WHERE name = 'RAMON CARRILLO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 4 FROM zones WHERE name = 'GENERAL ROCA - LA CALERA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 5 FROM zones WHERE name = 'LAS ACACIAS';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 6 FROM zones WHERE name = 'MARIANO MORENO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 7 FROM zones WHERE name = 'PALERMO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 8 FROM zones WHERE name = 'VISTA VERDE';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 9 FROM zones WHERE name = 'FELIPE NERI BOTTA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r1, id, 10 FROM zones WHERE name = 'SAN NICOLAS';

INSERT INTO schedules
  (collection_route_id, company_id, shift, week_days, start_time, end_time, valid_from, valid_until, is_active, created_by)
VALUES (@r1, 1, 'morning', '[1, 3, 5]', '06:00', '14:00', CURDATE(), NULL, TRUE, 1);

-- ---- Recorrido 2: Recorrido Sur-Centro - Residuos Domiciliarios (6 zonas) ----
INSERT INTO collection_routes
  (name, description, waste_type_id, company_id, geojson, distance_km, duration_min, is_active, created_by)
VALUES (
  'Recorrido Sur-Centro - Residuos Domiciliarios',
  'Recorrido de residuos domiciliarios urbanos. Cubre 6 barrios. Fuente: Geoportal Municipal Villa Maria (Cotreco S.A.).',
  1,
  1,
  '{"type": "LineString", "coordinates": [[-63.229726, -32.396983], [-63.232165, -32.40932], [-63.230989, -32.419218], [-63.23371, -32.423258], [-63.239106, -32.420526], [-63.250596, -32.419722]]}',
  4.69,
  47,
  TRUE,
  1
);
SET @r2 = LAST_INSERT_ID();

INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 1 FROM zones WHERE name = 'NICOLAS AVELLANEDA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 2 FROM zones WHERE name = 'GENERAL LAMADRID';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 3 FROM zones WHERE name = 'BERNARDINO RIVADAVIA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 4 FROM zones WHERE name = 'SANTA ANA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 5 FROM zones WHERE name = 'DOMINGO F SARMIENTO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r2, id, 6 FROM zones WHERE name = 'GENERAL PAZ';

INSERT INTO schedules
  (collection_route_id, company_id, shift, week_days, start_time, end_time, valid_from, valid_until, is_active, created_by)
VALUES (@r2, 1, 'night', '[1, 3, 5]', '22:00', '06:00', CURDATE(), NULL, TRUE, 1);

-- ---- Recorrido 3: Recorrido Oeste - Residuos Domiciliarios (6 zonas) ----
INSERT INTO collection_routes
  (name, description, waste_type_id, company_id, geojson, distance_km, duration_min, is_active, created_by)
VALUES (
  'Recorrido Oeste - Residuos Domiciliarios',
  'Recorrido de residuos domiciliarios urbanos. Cubre 6 barrios. Fuente: Geoportal Municipal Villa Maria (Cotreco S.A.).',
  1,
  1,
  '{"type": "LineString", "coordinates": [[-63.240313, -32.39452], [-63.245404, -32.398769], [-63.249947, -32.40136], [-63.259239, -32.405578], [-63.25642, -32.41319], [-63.237684, -32.402132]]}',
  5.21,
  50,
  TRUE,
  1
);
SET @r3 = LAST_INSERT_ID();

INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 1 FROM zones WHERE name = 'CARLOS PELLEGRINI';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 2 FROM zones WHERE name = 'TRINITARIOS';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 3 FROM zones WHERE name = 'ALMIRANTE BROWN';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 4 FROM zones WHERE name = 'ROQUE SAENZ PENA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 5 FROM zones WHERE name = 'GENERAL GUEMES';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r3, id, 6 FROM zones WHERE name = 'FLORENTINO AMEGHINO';

INSERT INTO schedules
  (collection_route_id, company_id, shift, week_days, start_time, end_time, valid_from, valid_until, is_active, created_by)
VALUES (@r3, 1, 'night', '[2, 4, 7]', '22:00', '06:00', CURDATE(), NULL, TRUE, 1);

-- ---- Recorrido 4: Recorrido Centro - Residuos Domiciliarios (4 zonas) ----
INSERT INTO collection_routes
  (name, description, waste_type_id, company_id, geojson, distance_km, duration_min, is_active, created_by)
VALUES (
  'Recorrido Centro - Residuos Domiciliarios',
  'Recorrido de residuos domiciliarios urbanos. Cubre 4 barrios. Fuente: Geoportal Municipal Villa Maria (Cotreco S.A.).',
  1,
  1,
  '{"type": "LineString", "coordinates": [[-63.245216, -32.40688], [-63.250937, -32.410796], [-63.244721, -32.417159], [-63.238973, -32.413384]]}',
  2.29,
  27,
  TRUE,
  1
);
SET @r4 = LAST_INSERT_ID();

INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r4, id, 1 FROM zones WHERE name = 'CENTRO NORTE';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r4, id, 2 FROM zones WHERE name = 'CENTRO OESTE';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r4, id, 3 FROM zones WHERE name = 'CENTRO SUR';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r4, id, 4 FROM zones WHERE name = 'CENTRO ESTE';

INSERT INTO schedules
  (collection_route_id, company_id, shift, week_days, start_time, end_time, valid_from, valid_until, is_active, created_by)
VALUES (@r4, 1, 'night', '[1, 2, 3, 4, 5, 7]', '22:00', '06:00', CURDATE(), NULL, TRUE, 1);

-- ---- Recorrido 5: Recorrido Este - Residuos Domiciliarios (12 zonas) ----
INSERT INTO collection_routes
  (name, description, waste_type_id, company_id, geojson, distance_km, duration_min, is_active, created_by)
VALUES (
  'Recorrido Este - Residuos Domiciliarios',
  'Recorrido de residuos domiciliarios urbanos. Cubre 12 barrios. Fuente: Geoportal Municipal Villa Maria (Cotreco S.A.).',
  1,
  1,
  '{"type": "LineString", "coordinates": [[-63.218228, -32.400682], [-63.214861, -32.406169], [-63.2186, -32.412253], [-63.225548, -32.415372], [-63.220004, -32.4223], [-63.214352, -32.427106], [-63.216258, -32.433603], [-63.215215, -32.440289], [-63.202361, -32.43051], [-63.189946, -32.437607], [-63.209091, -32.414434], [-63.225148, -32.404614]]}',
  13.40,
  114,
  TRUE,
  1
);
SET @r5 = LAST_INSERT_ID();

INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 1 FROM zones WHERE name = 'MALVINAS ARGENTINAS';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 2 FROM zones WHERE name = 'BELLO HORIZONTE';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 3 FROM zones WHERE name = 'SAN JUAN BAUTISTA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 4 FROM zones WHERE name = 'SAN JUSTO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 5 FROM zones WHERE name = 'INDUSTRIAL';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 6 FROM zones WHERE name = 'EVA PERON';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 7 FROM zones WHERE name = 'BARRANCAS DEL RIO';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 8 FROM zones WHERE name = 'VILLA DEL SUR';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 9 FROM zones WHERE name = 'LAS PLAYAS';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 10 FROM zones WHERE name = 'VILLA ALBERTINA';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 11 FROM zones WHERE name = 'LOS OLMOS';
INSERT INTO route_zones (collection_route_id, zone_id, visit_order) SELECT @r5, id, 12 FROM zones WHERE name = 'SAN MARTIN';

INSERT INTO schedules
  (collection_route_id, company_id, shift, week_days, start_time, end_time, valid_from, valid_until, is_active, created_by)
VALUES (@r5, 1, 'morning', '[2, 4, 6]', '06:00', '14:00', CURDATE(), NULL, TRUE, 1);

-- ---- Verificacion ----
SELECT cr.id, cr.name, COUNT(rz.zone_id) AS zonas, cr.distance_km, cr.duration_min
FROM collection_routes cr
LEFT JOIN route_zones rz ON rz.collection_route_id = cr.id
GROUP BY cr.id ORDER BY cr.id;

SELECT s.id, cr.name, s.shift, s.week_days, s.start_time, s.end_time
FROM schedules s JOIN collection_routes cr ON cr.id = s.collection_route_id
ORDER BY s.id;