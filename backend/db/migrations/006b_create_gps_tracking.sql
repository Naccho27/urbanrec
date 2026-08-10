-- ═════════════════════════════════════════════════════════
-- 006b_create_gps_tracking.sql
-- Puntos GPS registrados durante una ejecución.
--
-- Esta tabla crece continuamente durante la operación.
-- Con 10 camiones activos y actualizaciones cada 60 segundos
-- en turnos de 8 horas genera ~4.800 registros por día
-- y ~1.750.000 por año. Los índices son críticos.
--
-- Soporta operación offline: el conductor puede estar
-- sin señal y los puntos se sincronizan después.
-- recorded_at = momento real del GPS en el dispositivo
-- synced_at   = momento en que llegó al servidor
-- La diferencia entre ambos indica tiempo offline.
-- ═════════════════════════════════════════════════════════

CREATE TABLE gps_tracking (

  -- ── Identificación ───────────────────────────────────
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del punto GPS',

  -- ── Contexto ─────────────────────────────────────────
  execution_id    INT UNSIGNED    NOT NULL                    COMMENT 'Ejecución a la que pertenece este punto GPS',
  conductor_id    INT UNSIGNED    NOT NULL                    COMMENT 'Conductor que generó este punto. Redundante con execution pero acelera queries por conductor',

  -- ── Coordenadas ──────────────────────────────────────
  latitude        DECIMAL(10,7)   NOT NULL                    COMMENT 'Latitud del punto. DECIMAL(10,7) da precisión de ~1cm, más que suficiente para uso urbano',
  longitude       DECIMAL(10,7)   NOT NULL                    COMMENT 'Longitud del punto',
  accuracy_meters DECIMAL(6,2)    NULL                        COMMENT 'Precisión del GPS en metros reportada por el dispositivo. NULL si el dispositivo no la informa',

  -- ── Movimiento ───────────────────────────────────────
  speed_kmh       DECIMAL(6,2)    NULL                        COMMENT 'Velocidad en km/h en el momento del registro. Útil para detectar si el camión está detenido',
  heading         DECIMAL(5,2)    NULL                        COMMENT 'Dirección de movimiento en grados (0-360). 0=Norte, 90=Este, 180=Sur, 270=Oeste',

  -- ── Timestamps ───────────────────────────────────────
  recorded_at     TIMESTAMP       NOT NULL                    COMMENT 'Momento real en que el GPS registró la posición en el dispositivo del conductor',
  synced_at       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Momento en que el punto llegó al servidor. Si es mayor que recorded_at, el conductor estuvo offline',

  -- ── Modo offline ─────────────────────────────────────
  is_offline_sync BOOLEAN         NOT NULL DEFAULT FALSE      COMMENT 'TRUE = este punto fue registrado sin conexión y sincronizado después por el SyncQueue. FALSE = llegó en tiempo real',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (execution_id)
    REFERENCES route_executions(id)
    ON DELETE CASCADE,            -- si se borra la ejecución, se borran sus puntos GPS

  FOREIGN KEY (conductor_id)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_execution_recorded  (execution_id, recorded_at)   COMMENT 'Query principal: todos los puntos de una ejecución ordenados por tiempo. CRÍTICO para reconstruir el trazado real',
  INDEX idx_conductor_date      (conductor_id, recorded_at)   COMMENT 'Historial GPS de un conductor en un período',
  INDEX idx_offline             (is_offline_sync, synced_at)  COMMENT 'Detectar sincronizaciones offline y calcular tiempo sin señal'

) COMMENT = 'Puntos GPS registrados durante las ejecuciones. Tabla de alto volumen. Soporta modo offline con sincronización posterior';