-- ================================================================
-- 016_add_alert_settings.sql
-- Parámetro nuevo para las alertas automáticas (alerts.service.js)
--
-- Las otras reglas usan parámetros que ya existían en la 010:
--   max_route_duration_min     → alerta de demora
--   inactivity_alert_min       → alerta de inactividad GPS
--   license_expiry_alert_days  → aviso de licencia por vencer
-- Falta solo la tolerancia para avisar que un recorrido no arrancó.
-- ================================================================

USE residuos_urbanos;

INSERT INTO system_settings (`key`, value, type, description) VALUES
(
  'route_start_tolerance_min',
  '30',
  'number',
  'Minutos de tolerancia después de la hora de inicio del cronograma antes de alertar que un recorrido no se inició. 30 minutos cubre demoras normales de salida de la base (carga de combustible, armado de la cuadrilla) sin generar falsas alarmas'
) AS nuevo
ON DUPLICATE KEY UPDATE
  description = nuevo.description;

-- Verificación: los 4 parámetros que usan las alertas
SELECT `key`, value, type
FROM system_settings
WHERE `key` IN ('route_start_tolerance_min', 'max_route_duration_min',
                'inactivity_alert_min', 'license_expiry_alert_days');
