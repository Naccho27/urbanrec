-- ═════════════════════════════════════════════════════════
-- 005_create_schedules.sql
-- Cronogramas de ejecución de los recorridos.
--
-- Un schedule define CUÁNDO se ejecuta un recorrido:
-- qué días de la semana, en qué turno (mañana/tarde/noche)
-- y en qué horario. Es el puente entre el recorrido
-- definido por el municipio y la ejecución diaria
-- que registra lo que realmente pasó.
--
-- El municipio crea el schedule.
-- La empresa asigna sus conductores a través del
-- operador empresa cuando llega el día.
-- ═════════════════════════════════════════════════════════

CREATE TABLE schedules (

  -- ── Identificación ───────────────────────────────────
  id                    INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY  COMMENT 'Identificador único del cronograma',

  -- ── Recorrido asociado ───────────────────────────────
  collection_route_id   INT UNSIGNED    NOT NULL                    COMMENT 'Recorrido al que aplica este cronograma',

  -- ── Empresa y turno ──────────────────────────────────
  company_id            INT UNSIGNED    NOT NULL                    COMMENT 'Empresa prestadora responsable de ejecutar este cronograma',

  shift                 ENUM(
                          'morning',    -- turno mañana (ej: 06:00 a 14:00)
                          'afternoon',  -- turno tarde  (ej: 14:00 a 22:00)
                          'night'       -- turno noche  (ej: 22:00 a 06:00)
                        ) NOT NULL                                  COMMENT 'Franja horaria del turno. Determina en qué parte del día se ejecuta el recorrido',

  -- ── Días de la semana ────────────────────────────────
  week_days             JSON            NOT NULL                    COMMENT 'Días de la semana en que se ejecuta. Array de números: 1=lunes, 2=martes ... 7=domingo. Ej: [1,3,5] = lunes, miércoles y viernes',

  -- ── Horario ──────────────────────────────────────────
  start_time            TIME            NOT NULL                    COMMENT 'Hora de inicio del recorrido. Ej: 06:00:00',
  end_time              TIME            NOT NULL                    COMMENT 'Hora estimada de finalización. Usada para calcular alertas de demora',

  -- ── Vigencia ─────────────────────────────────────────
  valid_from            DATE            NOT NULL                    COMMENT 'Fecha desde la que aplica este cronograma. Permite programar cambios futuros',
  valid_until           DATE            NULL                        COMMENT 'Fecha hasta la que aplica. NULL = vigente indefinidamente. Permite desactivar cronogramas en una fecha específica',

  -- ── Control ──────────────────────────────────────────
  is_active             BOOLEAN         NOT NULL DEFAULT TRUE       COMMENT 'TRUE = cronograma activo. FALSE = suspendido temporalmente (feriado, emergencia)',

  -- ── Trazabilidad ─────────────────────────────────────
  created_by            INT UNSIGNED    NOT NULL                    COMMENT 'Operador municipal que creó el cronograma',

  -- ── Auditoría ────────────────────────────────────────
  created_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP  COMMENT 'Fecha de creación',
  updated_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de última modificación',

  -- ── Foreign keys ─────────────────────────────────────
  FOREIGN KEY (collection_route_id)
    REFERENCES collection_routes(id)
    ON DELETE RESTRICT,           -- no se puede borrar un recorrido con cronogramas

  FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE RESTRICT,           -- no se puede borrar una empresa con cronogramas

  FOREIGN KEY (created_by)
    REFERENCES users(id)
    ON DELETE RESTRICT,           -- no se puede borrar el operador que creó el cronograma

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_route         (collection_route_id)   COMMENT 'Cronogramas de un recorrido específico',
  INDEX idx_company       (company_id)            COMMENT 'Cronogramas asignados a una empresa',
  INDEX idx_shift         (shift)                 COMMENT 'Filtrar por turno',
  INDEX idx_active        (is_active)             COMMENT 'Solo cronogramas activos',
  INDEX idx_validity      (valid_from, valid_until) COMMENT 'Cronogramas vigentes en una fecha determinada',
  INDEX idx_company_shift (company_id, shift)     COMMENT 'Query más común del operador empresa: mis cronogramas de tarde'

) COMMENT = 'Cronogramas de ejecución de los recorridos. Define cuándo y en qué turno se ejecuta cada recorrido. El municipio los crea, la empresa asigna conductores';