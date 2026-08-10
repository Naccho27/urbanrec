CREATE TABLE zones (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la zona',
  name        VARCHAR(150)    NOT NULL                    COMMENT 'Nombre descriptivo. Ej: Centro, Barrio Sarmiento, Villa del Parque',
  description TEXT            NULL                        COMMENT 'Límites referenciales, características del sector, observaciones operativas',
  geojson     JSON            NOT NULL                    COMMENT 'Polígono en formato GeoJSON: {"type":"Polygon","coordinates":[[[lng,lat]...]]}. Leaflet lo renderiza directamente',
  center_lat  DECIMAL(10,7)   NOT NULL                    COMMENT 'Latitud del centroide. Calculado al crear la zona. Para búsquedas de proximidad y label en el mapa',
  center_lng  DECIMAL(10,7)   NOT NULL                    COMMENT 'Longitud del centroide. DECIMAL(10,7) da precisión de ~1cm',
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE       COMMENT 'TRUE = zona activa con servicio. FALSE = sin servicio, no aparece en mapa público',
  created_by  INT UNSIGNED    NOT NULL                    COMMENT 'Operador municipal que creó la zona. Solo el municipio puede crear zonas',
  created_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación',
  updated_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,

  INDEX idx_active     (is_active)        COMMENT 'Filtrar zonas activas para el mapa público',
  INDEX idx_created_by (created_by)       COMMENT 'Zonas creadas por un operador específico',
  INDEX idx_center     (center_lat, center_lng) COMMENT 'Búsquedas de proximidad por coordenadas'

) COMMENT = 'Zonas geográficas de recolección definidas por el municipio. Polígono GeoJSON renderizable en Leaflet';