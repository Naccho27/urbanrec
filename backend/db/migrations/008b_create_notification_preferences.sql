-- ═════════════════════════════════════════════════════════
-- 008b_create_notification_preferences.sql
-- Preferencias de notificación por usuario y tipo de evento.
--
-- Cada usuario puede configurar qué notificaciones
-- quiere recibir y por qué canal.
-- Si no existe una preferencia para un tipo,
-- el sistema usa los valores por defecto del rol.
-- ═════════════════════════════════════════════════════════

CREATE TABLE notification_preferences (

  -- ── Clave compuesta ──────────────────────────────────
  user_id             INT UNSIGNED    NOT NULL        COMMENT 'Usuario dueño de esta preferencia',
  notification_type   VARCHAR(50)     NOT NULL        COMMENT 'Tipo de notificación al que aplica esta preferencia. Ej: route_completed, incident_reported',

  -- ── Preferencias por canal ───────────────────────────
  in_app_enabled      BOOLEAN         NOT NULL DEFAULT TRUE   COMMENT 'TRUE = recibir este tipo de notificación dentro de la app. FALSE = ignorar',
  email_enabled       BOOLEAN         NOT NULL DEFAULT FALSE  COMMENT 'TRUE = recibir este tipo por email. FALSE = solo in-app o ninguno',

  PRIMARY KEY (user_id, notification_type)            COMMENT 'Clave compuesta: un usuario tiene una preferencia por tipo',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE             -- si se borra el usuario, se borran sus preferencias

) COMMENT = 'Preferencias de notificación por usuario. Define qué eventos notificar y por qué canal para cada persona';