-- ═════════════════════════════════════════════════════════
-- 008_create_notifications.sql
-- Notificaciones enviadas a los usuarios del sistema.
--
-- Las notificaciones in-app se crean acá y se emiten
-- via Socket.IO en tiempo real. Las de email se envían
-- con nodemailer y también quedan registradas acá
-- para historial y control de lectura.
-- ═════════════════════════════════════════════════════════

CREATE TABLE notifications (

  -- ── Identificación ───────────────────────────────────
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único de la notificación',

  -- ── Destinatario ─────────────────────────────────────
  user_id     INT UNSIGNED    NULL                   COMMENT 'Usuario que recibe la notificación',

  -- ── Contenido ────────────────────────────────────────
  type        VARCHAR(50)     NOT NULL                    COMMENT 'Tipo de evento que generó la notificación. Ej: route_completed, incident_reported, route_delayed, license_expiring',
  title       VARCHAR(200)    NOT NULL                    COMMENT 'Título corto de la notificación. Ej: Recorrido completado',
  body        TEXT            NOT NULL                    COMMENT 'Cuerpo completo de la notificación con el detalle del evento',

  -- ── Canal de envío ───────────────────────────────────
  channel     ENUM(
                'in_app',   -- notificación dentro de la aplicación via Socket.IO
                'email'     -- notificación por correo electrónico via nodemailer
              ) NOT NULL DEFAULT 'in_app'                 COMMENT 'Canal por el que se envió la notificación',

  -- ── Estado ───────────────────────────────────────────
  is_read     BOOLEAN         NOT NULL DEFAULT FALSE      COMMENT 'TRUE = el usuario leyó la notificación. FALSE = pendiente de lectura',
  sent_at     TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Momento en que se envió la notificación',

  -- ── Referencia al evento ─────────────────────────────
  entity      VARCHAR(100)    NULL                        COMMENT 'Entidad relacionada con el evento. Ej: route_execution, incident, schedule',
  entity_id   INT UNSIGNED    NULL                        COMMENT 'ID de la entidad relacionada. Permite navegar al detalle desde la notificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,            -- si se borra el usuario, se borran sus notificaciones

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_user_read     (user_id, is_read)    COMMENT 'Notificaciones no leídas de un usuario — badge de campana',
  INDEX idx_user_date     (user_id, sent_at)    COMMENT 'Historial de notificaciones de un usuario ordenado por fecha',
  INDEX idx_type          (type)                COMMENT 'Filtrar notificaciones por tipo de evento',
  INDEX idx_entity        (entity, entity_id)   COMMENT 'Notificaciones relacionadas a un evento específico'

) COMMENT = 'Notificaciones enviadas a los usuarios. Soporta canal in-app via Socket.IO y email via nodemailer';