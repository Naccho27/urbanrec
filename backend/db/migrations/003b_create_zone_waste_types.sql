CREATE TABLE zone_waste_types (
  zone_id       INT UNSIGNED  NOT NULL  COMMENT 'Zona que recibe este tipo de recolección',
  waste_type_id INT UNSIGNED  NOT NULL  COMMENT 'Tipo de residuo recolectado en esta zona',

  PRIMARY KEY (zone_id, waste_type_id)  COMMENT 'Clave compuesta. Evita que una zona tenga el mismo tipo duplicado',

  -- Si se borra la zona, se borran sus relaciones de tipos
  -- (MySQL no admite COMMENT en una FOREIGN KEY: la explicación va acá)
  FOREIGN KEY (zone_id)       REFERENCES zones(id)       ON DELETE CASCADE,
  -- Si se borra un tipo, se borran sus relaciones con zonas
  FOREIGN KEY (waste_type_id) REFERENCES waste_types(id) ON DELETE CASCADE

) COMMENT = 'Relación zona-tipo de residuo. Una zona puede tener General Y Reciclable, cada uno con su cronograma';
