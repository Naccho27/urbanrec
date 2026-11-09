'use strict'

// ─────────────────────────────────────────────────────────
// ALERTAS AUTOMÁTICAS POR REGLAS DE NEGOCIO
// (alcance 12.2 y 14.2 del documento de tesis)
//
// Cada minuto se revisan las ejecuciones y se avisa a quien
// corresponde cuando se cumple alguna de estas reglas:
//
//   1. Recorrido no iniciado: pasó la hora de inicio del cronograma
//      + tolerancia y el recorrido sigue sin arrancar.
//   2. Demora: el recorrido sigue en curso después del máximo
//      permitido (max_route_duration_min).
//   3. Inactividad GPS: un recorrido en curso no manda posición hace
//      más de inactivity_alert_min minutos.
//   4. Recorrido incompleto: finalizó sin recolectar todos los barrios.
//   5. Licencia por vencer: revisión cada 6 horas, aviso semanal.
//
// Esto NO es inteligencia artificial: son reglas deterministas con
// umbrales configurables desde system_settings (el admin los cambia
// sin tocar código). La IA queda reservada para optimización de rutas
// y predicción de demanda, como define el documento.
//
// Sin duplicados: antes de avisar se busca en la tabla notifications
// si ya se avisó lo mismo (mismo tipo + misma ejecución o conductor).
// Así, aunque la revisión corre cada minuto, cada situación se avisa
// una sola vez.
// ─────────────────────────────────────────────────────────

const pool          = require('../../../config/db')
const logger        = require('../../../shared/utils/logger')
const settings      = require('../../settings/services/settings.service')
const notifService  = require('./notifications.service')
const userModel     = require('../../users/models/user.model')
const { NOTIFICATION_TYPES } = require('../../../shared/utils/constants')

// Cada cuánto se revisan las ejecuciones (1 minuto, igual que el GPS)
const CHECK_INTERVAL_MS   = 60 * 1000
// Las licencias cambian poco: alcanza con revisarlas cada 6 horas
const LICENSE_INTERVAL_MS = 6 * 60 * 60 * 1000
// Un aviso de licencia se repite como máximo una vez por semana
const LICENSE_REMINDER_DAYS = 7
// Los recorridos incompletos se miran solo si terminaron en las
// últimas 24 h (para no avisar sobre todo el histórico al arrancar)
const INCOMPLETE_LOOKBACK_HOURS = 24

// Valores por defecto si un parámetro no está cargado en la base
const DEFAULTS = {
  max_route_duration_min:    480,
  inactivity_alert_min:       20,
  route_start_tolerance_min:  30,
  license_expiry_alert_days:  30
}

const getSetting = async (key) => {
  const value = await settings.get(key)
  return value === null || value === undefined || Number.isNaN(value) ? DEFAULTS[key] : value
}

// ── Destinatarios ────────────────────────────────────────
// El municipio fiscaliza todo; cada empresa ve solo lo suyo
// (mismo criterio de aislamiento que el resto del sistema)
const getSupervisors = async (companyId) => {
  const [rows] = await pool.execute(
    `SELECT id FROM users
     WHERE is_active = TRUE AND deleted_at IS NULL
     AND (role = 'municipal' OR (role = 'operator_company' AND company_id = ?))`,
    [companyId]
  )
  return rows.map(r => r.id)
}

const getCompanyOperators = async (companyId) => {
  const [rows] = await pool.execute(
    `SELECT id FROM users
     WHERE is_active = TRUE AND deleted_at IS NULL
     AND role = 'operator_company' AND company_id = ?`,
    [companyId]
  )
  return rows.map(r => r.id)
}

// ── Control de duplicados ────────────────────────────────
// ¿Ya existe un aviso de este tipo para esta entidad desde 'since'?
// since = null → en cualquier momento (se avisa una sola vez)
const alreadyNotified = async (type, entity, entityId, since = null) => {
  const params = [type, entity, entityId]
  let query = `SELECT 1 FROM notifications
               WHERE type = ? AND entity = ? AND entity_id = ?`
  if (since) { query += ' AND sent_at >= ?'; params.push(since) }
  query += ' LIMIT 1'
  const [rows] = await pool.execute(query, params)
  return rows.length > 0
}

// ═════════════════════════════════════════════════════════
// REGLA 1 — Recorrido no iniciado
// ═════════════════════════════════════════════════════════
const checkNotStarted = async () => {
  const tolerance = await getSetting('route_start_tolerance_min')

  // TIMESTAMP(fecha, hora) arma la fecha y hora de inicio programada.
  // Solo se miran ayer y hoy: ayer cubre los turnos noche que empiezan
  // a las 22:00 y se controlan pasada la medianoche.
  const [rows] = await pool.execute(
    `SELECT re.id, re.company_id, re.conductor_id, cr.name AS route_name,
            TIMESTAMP(re.execution_date, s.start_time) AS scheduled_start,
            TIMESTAMPDIFF(MINUTE, TIMESTAMP(re.execution_date, s.start_time), NOW()) AS late_min
     FROM route_executions re
     INNER JOIN schedules s          ON s.id = re.schedule_id
     INNER JOIN collection_routes cr ON cr.id = re.collection_route_id
     WHERE re.status IN ('pending', 'assigned')
     AND re.execution_date >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
     AND NOW() > DATE_ADD(TIMESTAMP(re.execution_date, s.start_time), INTERVAL ? MINUTE)`,
    [tolerance]
  )

  let sent = 0
  for (const row of rows) {
    if (await alreadyNotified(NOTIFICATION_TYPES.ROUTE_NOT_STARTED, 'route_execution', row.id)) continue
    const recipients = await getSupervisors(row.company_id)
    // Al conductor asignado también se le avisa
    if (row.conductor_id) recipients.push(row.conductor_id)
    for (const userId of recipients) {
      await notifService.notifyRouteNotStarted(userId, {
        executionId: row.id, routeName: row.route_name, lateMin: row.late_min
      })
    }
    sent++
  }
  return sent
}

// ═════════════════════════════════════════════════════════
// REGLA 2 — Demora (recorrido en curso por encima del máximo)
// ═════════════════════════════════════════════════════════
const checkDelayed = async () => {
  const maxMin = await getSetting('max_route_duration_min')

  const [rows] = await pool.execute(
    `SELECT re.id, re.company_id, cr.name AS route_name,
            TIMESTAMPDIFF(MINUTE, re.started_at, NOW()) AS elapsed_min
     FROM route_executions re
     INNER JOIN collection_routes cr ON cr.id = re.collection_route_id
     WHERE re.status IN ('in_progress', 'paused')
     AND re.started_at IS NOT NULL
     AND TIMESTAMPDIFF(MINUTE, re.started_at, NOW()) > ?`,
    [maxMin]
  )

  let sent = 0
  for (const row of rows) {
    if (await alreadyNotified(NOTIFICATION_TYPES.ROUTE_DELAYED, 'route_execution', row.id)) continue
    for (const userId of await getSupervisors(row.company_id)) {
      await notifService.notifyRouteDelayed(userId, {
        executionId: row.id, routeName: row.route_name, elapsedMin: row.elapsed_min
      })
    }
    sent++
  }
  return sent
}

// ═════════════════════════════════════════════════════════
// REGLA 3 — Inactividad GPS
// ═════════════════════════════════════════════════════════
// Solo recorridos 'in_progress': si está en pausa, que el camión no se
// mueva es lo esperable. Si todavía no mandó ningún punto, se toma la
// hora de inicio como última señal.
const checkGpsInactivity = async () => {
  const maxSilence = await getSetting('inactivity_alert_min')

  const [rows] = await pool.execute(
    `SELECT re.id, re.company_id, cr.name AS route_name, u.name AS conductor_name,
            COALESCE(MAX(g.recorded_at), re.started_at) AS last_signal,
            TIMESTAMPDIFF(MINUTE, COALESCE(MAX(g.recorded_at), re.started_at), NOW()) AS silent_min
     FROM route_executions re
     INNER JOIN collection_routes cr ON cr.id = re.collection_route_id
     LEFT JOIN users u               ON u.id = re.conductor_id
     LEFT JOIN gps_tracking g        ON g.execution_id = re.id
     WHERE re.status = 'in_progress'
     AND re.started_at IS NOT NULL
     GROUP BY re.id, re.company_id, cr.name, u.name, re.started_at
     HAVING silent_min >= ?`,
    [maxSilence]
  )

  let sent = 0
  for (const row of rows) {
    // Se avisa una vez por cada "silencio": si después de un aviso el
    // GPS vuelve y se vuelve a cortar, last_signal es más nueva que el
    // aviso anterior y corresponde avisar de nuevo.
    if (await alreadyNotified(NOTIFICATION_TYPES.GPS_INACTIVITY, 'route_execution', row.id, row.last_signal)) continue
    for (const userId of await getSupervisors(row.company_id)) {
      await notifService.notifyGpsInactivity(userId, {
        executionId: row.id, routeName: row.route_name,
        conductorName: row.conductor_name, silentMin: row.silent_min
      })
    }
    sent++
  }
  return sent
}

// ═════════════════════════════════════════════════════════
// REGLA 4 — Recorrido incompleto
// ═════════════════════════════════════════════════════════
const checkIncomplete = async () => {
  const [rows] = await pool.execute(
    `SELECT re.id, re.company_id, cr.name AS route_name,
            re.completion_pct, re.zones_visited, re.zones_total
     FROM route_executions re
     INNER JOIN collection_routes cr ON cr.id = re.collection_route_id
     WHERE re.status IN ('completed', 'with_issues')
     AND re.completion_pct < 100
     AND re.completed_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [INCOMPLETE_LOOKBACK_HOURS]
  )

  let sent = 0
  for (const row of rows) {
    if (await alreadyNotified(NOTIFICATION_TYPES.ROUTE_INCOMPLETE, 'route_execution', row.id)) continue
    for (const userId of await getSupervisors(row.company_id)) {
      await notifService.notifyRouteIncomplete(userId, {
        executionId: row.id, routeName: row.route_name,
        completionPct: parseFloat(row.completion_pct),
        zonesVisited: row.zones_visited, zonesTotal: row.zones_total
      })
    }
    sent++
  }
  return sent
}

// ═════════════════════════════════════════════════════════
// REGLA 5 — Licencias por vencer
// ═════════════════════════════════════════════════════════
// Avisa al operador de la empresa del conductor y al propio conductor.
// El municipio no: la gestión de conductores es de la empresa.
const checkLicenses = async () => {
  const days = await getSetting('license_expiry_alert_days')
  const conductors = await userModel.findExpiringLicenses(days)
  const since = new Date(Date.now() - LICENSE_REMINDER_DAYS * 24 * 60 * 60 * 1000)

  let sent = 0
  for (const c of conductors) {
    if (await alreadyNotified(NOTIFICATION_TYPES.LICENSE_EXPIRING, 'user', c.id, since)) continue
    const recipients = c.company_id ? await getCompanyOperators(c.company_id) : []
    recipients.push(c.id)
    for (const userId of recipients) {
      await notifService.notifyLicenseExpiring(userId, {
        conductorId: c.id, conductorName: c.name, expiryDate: c.license_expiry
      })
    }
    sent++
  }
  return sent
}

// ═════════════════════════════════════════════════════════
// PLANIFICADOR
// ═════════════════════════════════════════════════════════
// Se usa setInterval de Node en vez de una librería tipo node-cron:
// las reglas corren cada minuto y no necesitan horarios exactos, así
// que no hace falta sumar otra dependencia.
let running = false

// Corre una regla aislada: si una falla, las demás siguen
const safeRun = async (name, fn) => {
  try {
    const count = await fn()
    if (count > 0) logger.info(`Alertas: ${count} aviso(s) de ${name}`)
  } catch (err) {
    logger.error(`Alertas (${name}): ${err.message}`)
  }
}

const runExecutionChecks = async () => {
  // Si una revisión tarda más de un minuto, no se superpone con la siguiente
  if (running) return
  running = true
  try {
    await safeRun('recorrido no iniciado', checkNotStarted)
    await safeRun('demora', checkDelayed)
    await safeRun('inactividad GPS', checkGpsInactivity)
    await safeRun('recorrido incompleto', checkIncomplete)
  } finally {
    running = false
  }
}

const runLicenseCheck = () => safeRun('licencia por vencer', checkLicenses)

const startScheduler = () => {
  // Primera revisión unos segundos después de arrancar, para no
  // competir con la conexión inicial a MySQL y Redis
  setTimeout(() => {
    runExecutionChecks()
    runLicenseCheck()
  }, 5000)

  setInterval(runExecutionChecks, CHECK_INTERVAL_MS)
  setInterval(runLicenseCheck, LICENSE_INTERVAL_MS)

  logger.info('Alertas automáticas activas (revisión cada 60 s)')
}

module.exports = {
  startScheduler,
  // exportadas para poder probar cada regla por separado
  checkNotStarted,
  checkDelayed,
  checkGpsInactivity,
  checkIncomplete,
  checkLicenses
}
