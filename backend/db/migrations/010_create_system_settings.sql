-- ═════════════════════════════════════════════════════════
-- 010_create_system_settings.sql
-- Parámetros de configuración global del sistema.
--
-- Permite al administrador ajustar el comportamiento
-- del sistema sin tocar código ni reiniciar el servidor.
-- El backend lee estos valores al inicio y los cachea
-- en memoria. Se actualiza el caché cuando el admin
-- modifica un parámetro desde el panel.
--
-- Estructura clave-valor con tipo para que el backend
-- sepa cómo interpretar el valor (string, número, booleano).
-- ═════════════════════════════════════════════════════════

CREATE TABLE system_settings (

  -- ── Clave única ──────────────────────────────────────
  `key`         VARCHAR(100)    NOT NULL PRIMARY KEY        COMMENT 'Nombre único del parámetro. Ej: gps_proximity_radius, max_route_duration_min',

  -- ── Valor ────────────────────────────────────────────
  value         VARCHAR(500)    NOT NULL                    COMMENT 'Valor del parámetro como string. El backend lo convierte al tipo correspondiente según la columna type',

  -- ── Tipo de dato ─────────────────────────────────────
  type          ENUM(
                  'string',     -- texto libre
                  'number',     -- número entero o decimal
                  'boolean',    -- true o false
                  'json'        -- objeto o array JSON
                ) NOT NULL DEFAULT 'string'                 COMMENT 'Tipo de dato del valor. Permite al backend convertirlo correctamente al leerlo',

  -- ── Documentación ────────────────────────────────────
  description   TEXT            NULL                        COMMENT 'Explicación del parámetro para el administrador. Qué hace, qué valores acepta, cuál es el impacto de cambiarlo',

  -- ── Trazabilidad ─────────────────────────────────────
  updated_by    INT UNSIGNED    NULL                        COMMENT 'Último administrador que modificó este parámetro. NULL = valor inicial del seed',
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de la última modificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (updated_by)
    REFERENCES users(id)
    ON DELETE SET NULL

) COMMENT = 'Parámetros de configuración global del sistema. Editables desde el panel admin sin modificar código ni reiniciar el servidor';

-- ── Seed inicial — valores ajustados para Villa María ────
INSERT INTO system_settings (`key`, value, type, description) VALUES

  -- GPS y tracking del conductor
  (
    'gps_update_interval_sec',
    '60',
    'number',
    'Segundos entre actualizaciones de posición GPS del conductor durante el recorrido. 60 segundos da buena resolución sin consumir batería excesiva. A 30 km/h el camión recorre ~500m entre actualizaciones'
  ),
  (
    'gps_proximity_radius_meters',
    '75',
    'number',
    'Radio en metros para evaluar proximidad del camión al centroide de una zona. En Villa María las zonas son barrios completos o sectores amplios, por eso 75m es más robusto para GPS de dispositivos móviles estándar. Se usa junto con gps_zone_confirmation_sec'
  ),
  (
    'gps_zone_confirmation_sec',
    '120',
    'number',
    'Segundos mínimos que el camión debe permanecer dentro del radio de una zona para confirmarla como visitada. Con gps_update_interval_sec=60, requiere 2 puntos GPS consecutivos dentro del radio. Evita falsos positivos cuando el camión pasa por una avenida cercana sin haber recorrido realmente la zona'
  ),

  -- Alertas operativas
  (
    'max_route_duration_min',
    '480',
    'number',
    'Minutos máximos que puede durar un recorrido antes de generar una alerta de demora al operador municipal. 480 = 8 horas = un turno completo. Si el recorrido sigue en curso después de este tiempo, algo está mal'
  ),
  (
    'inactivity_alert_min',
    '20',
    'number',
    'Minutos sin actualización GPS antes de generar una alerta de inactividad. 20 minutos da margen para zonas de baja cobertura en Villa María sin generar falsos positivos. Puede indicar que el conductor perdió señal, el dispositivo se quedó sin batería o el camión se detuvo'
  ),
  (
    'license_expiry_alert_days',
    '30',
    'number',
    'Días de anticipación para alertar al operador empresa sobre el vencimiento de la licencia de un conductor. 30 días da tiempo suficiente para gestionar la renovación sin apuro'
  ),

  -- Notificaciones
  (
    'email_alerts_enabled',
    'true',
    'boolean',
    'Habilita el envío de notificaciones por correo electrónico para alertas críticas (incidentes, demoras, licencias por vencer). true = activo, false = solo notificaciones in-app via Socket.IO'
  ),

  -- Sincronización offline
  (
    'sync_queue_max_age_hours',
    '24',
    'number',
    'Horas máximas que un registro offline puede estar en la cola antes de descartarse. Un turno dura máximo 8 horas, así que 24 horas cubre cualquier escenario normal de pérdida de señal'
  );