-- 002_create_waste_types.sql
CREATE TABLE waste_types (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del tipo de residuo',
  name        VARCHAR(100)  NOT NULL UNIQUE             COMMENT 'Nombre del tipo. Ej: General, Reciclable, Orgánico, Poda. Único en el sistema',
  description TEXT          NULL                        COMMENT 'Qué materiales incluye, cómo separarlo, observaciones',
  color       VARCHAR(7)    NULL                        COMMENT 'Color hex (#RRGGBB) para el mapa Leaflet y gráficos Recharts. Ej: #43A047',
  icon        VARCHAR(50)   NULL                        COMMENT 'Nombre del ícono Lucide React para el frontend. Ej: trash, recycle, leaf, tree',
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE       COMMENT 'TRUE = activo. FALSE = desactivado temporalmente, historial conservado',
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación',
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación'
) COMMENT = 'Tipos de residuo del sistema. Cada tipo tiene su propio camión y cronograma';

INSERT INTO waste_types (name, description, color, icon, is_active) VALUES
  ('Residuos domiciliarios urbanos',    'Residuos domiciliarios urbanos generales no separados',                                          '#78909C', 'trash',   TRUE),
  ('Residuos secos reciclable', 'Residuos secos: papel, cartón, plástico, vidrio, aluminio, tetrabrik. Limpios y secos',         '#43A047', 'recycle', TRUE),
  ('Orgánico',   'Residuos orgánicos: frutas, verduras, restos de infusiones, cáscaras de huevo',                 '#8D6E63', 'leaf',    TRUE),
  ('Poda y escombro', 'Restos de poda y escombros hasta 1m³. Requiere solicitud previa con 24hs de anticipación',      '#827717', 'tree',    TRUE);