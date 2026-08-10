-- ═════════════════════════════════════════════════════════
-- 009_create_audit_logs.sql
-- Registro automático de todas las acciones sensibles
-- realizadas en el sistema.
--
-- Esta tabla es el historial legal y operativo del sistema.
-- Se alimenta automáticamente desde un middleware en Node.js
-- que intercepta las operaciones sensibles sin que cada
-- módulo tenga que preocuparse por registrarlas.
--
-- Acciones que se registran:
-- - Crear, editar o eliminar zonas y recorridos
-- - Cambiar el estado de una ejecución
-- - Cambiar el rol de un usuario
-- - Aprobar o rechazar sugerencias de IA
-- - Desactivar una cuenta de operador empresa
-- - Cambios en configuración del sistema
-- - Activación y desactivación de TOTP
--
-- BIGINT para el id porque esta tabla puede llegar
-- a millones de registros en producción prolongada.
-- ═════════════════════════════════════════════════════════

CREATE TABLE audit_logs (

  -- ── Identificación ───────────────────────────────────
  id          BIGINT UNSIGNED   AUTO_INCREMENT PRIMARY KEY  COMMENT 'BIGINT porque esta tabla crece con cada acción sensible y puede llegar a millones de registros',

  -- ── Quién hizo la acción ─────────────────────────────
  user_id     INT UNSIGNED      NULL                        COMMENT 'Usuario que realizó la acción. NULL si fue el sistema automáticamente (ej: alerta por timeout)',
  role        VARCHAR(50)       NULL                        COMMENT 'Rol del usuario al momento de la acción. Se guarda porque el rol puede cambiar después',
  company_id  INT UNSIGNED      NULL                        COMMENT 'Empresa del usuario al momento de la acción. Para filtrar actividad por empresa en el panel admin',

  -- ── Qué hizo ─────────────────────────────────────────
  action      VARCHAR(100)      NOT NULL                    COMMENT 'Acción realizada. Ej: CREATE, UPDATE, DELETE, APPROVE_AI, REJECT_AI, DISABLE_ACCOUNT, ENABLE_TOTP',
  entity      VARCHAR(100)      NOT NULL                    COMMENT 'Entidad sobre la que se actuó. Ej: zone, collection_route, user, schedule, ai_suggestion',
  entity_id   INT UNSIGNED      NULL                        COMMENT 'ID del registro afectado. NULL si la acción no aplica a un registro específico',

  -- ── Qué cambió ───────────────────────────────────────
  old_values  JSON              NULL                        COMMENT 'Estado anterior del registro antes de la acción. NULL para CREATE. Permite saber exactamente qué cambió',
  new_values  JSON              NULL                        COMMENT 'Estado nuevo del registro después de la acción. NULL para DELETE. Permite ver el resultado del cambio',

  -- ── Contexto técnico ─────────────────────────────────
  ip_address  VARCHAR(45)       NULL                        COMMENT 'IP desde donde se realizó la acción. VARCHAR(45) soporta IPv4 e IPv6',
  user_agent  TEXT              NULL                        COMMENT 'Navegador y sistema operativo del dispositivo desde donde se actuó',

  -- ── Timestamp ────────────────────────────────────────
  created_at  TIMESTAMP         DEFAULT CURRENT_TIMESTAMP  COMMENT 'Momento exacto en que ocurrió la acción. No tiene updated_at porque un log nunca se modifica',

  -- ── Foreign keys ─────────────────────────────────────
  -- SET NULL porque si se borra el usuario el log debe conservarse
  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE SET NULL,

  -- ── Índices ──────────────────────────────────────────
  INDEX idx_user_date     (user_id, created_at)       COMMENT 'Todas las acciones de un usuario en un período',
  INDEX idx_entity        (entity, entity_id)         COMMENT 'Historial completo de cambios sobre un registro específico',
  INDEX idx_action_date   (action, created_at)        COMMENT 'Todas las acciones de un tipo en un período',
  INDEX idx_company_date  (company_id, created_at)    COMMENT 'Actividad de una empresa específica — panel admin',
  INDEX idx_role_date     (role, created_at)          COMMENT 'Actividad por rol en un período'

) COMMENT = 'Log de auditoría automático. Registra todas las acciones sensibles del sistema con contexto completo. Nunca se modifica, solo se inserta';