'use strict'

const { Router }    = require('express')
const { query }     = require('express-validator')
const asyncWrapper  = require('../../shared/middlewares/asyncWrapper')
const validate      = require('../../shared/middlewares/validate.middleware')
const { ok }        = require('../../shared/utils/responses')
const cache         = require('../../shared/services/cache.service')
const scheduleModel = require('../../modules/schedules/models/schedule.model')

const router = Router()

// Los cronogramas cambian muy poco: se cachean 1 hora por barrio.
// schedules.service y collection-routes.service invalidan el caché
// cuando se crea, modifica o desactiva un cronograma o un recorrido.
const PUBLIC_SCHEDULES_TTL = 3600

const DAY_NAMES   = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const SHIFT_NAMES = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' }

// "Lunes, Miércoles y Viernes"
const daysLabel = (days) => {
  const names = days.map(d => DAY_NAMES[d])
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
    : names[0] || ''
}

// "22:00:00" → "22:00"
const hhmm = (time) => String(time).slice(0, 5)

// Día ISO de una fecha: 1 = lunes … 7 = domingo (igual que week_days)
const isoDay = (date) => ((date.getDay() + 6) % 7) + 1

const ymd = (date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

// Próxima recolección a partir de ahora (busca hasta 7 días adelante).
// Hoy cuenta solo si todavía no pasó la hora de inicio. No se cachea
// porque depende de la hora de la consulta.
const nextCollection = (schedules, now = new Date()) => {
  for (let offset = 0; offset <= 7; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const candidates = schedules
      .filter(s => s.week_days.includes(isoDay(date)))
      .filter(s => {
        if (offset > 0) return true
        const [h, m] = String(s.start_time).split(':').map(Number)
        return now.getHours() * 60 + now.getMinutes() < h * 60 + m
      })
    if (candidates.length) {
      const s = candidates[0]   // vienen ordenados por hora de inicio
      return {
        date:       ymd(date),
        day_name:   DAY_NAMES[isoDay(date)],
        is_today:   offset === 0,
        start_time: hhmm(s.start_time),
        end_time:   hhmm(s.end_time),
        shift:      s.shift,
        shift_name: SHIFT_NAMES[s.shift],
        waste_type: s.waste_type
      }
    }
  }
  return null
}

// GET /api/v1/public/schedules?zone_id=5
// Sin autenticación: el ciudadano consulta qué días y en qué horario
// pasa el camión por su barrio (alcance 1.2) y cuándo es la próxima vez.
router.get('/',
  query('zone_id')
    .notEmpty().withMessage('zone_id es requerido')
    .isInt({ min: 1 }).withMessage('zone_id debe ser un número entero positivo')
    .toInt(),
  validate,
  asyncWrapper(async (req, res) => {
    const zoneId = req.query.zone_id

    const data = await cache.remember(
      `${cache.KEYS.SCHEDULES}:public:zone:${zoneId}`,
      PUBLIC_SCHEDULES_TTL,
      () => scheduleModel.findPublicByZone(zoneId)
    )

    if (!data) {
      const err = new Error('Barrio no encontrado')
      err.statusCode = 404
      throw err
    }

    const schedules = data.schedules.map(s => ({
      shift:            s.shift,
      shift_name:       SHIFT_NAMES[s.shift],
      week_days:        s.week_days,
      days_label:       daysLabel(s.week_days),
      start_time:       hhmm(s.start_time),
      end_time:         hhmm(s.end_time),
      waste_type:       s.waste_type,
      waste_type_color: s.waste_type_color,
      company_name:     s.company_name
    }))

    return ok(res, {
      zone:            data.zone,
      schedules,
      next_collection: nextCollection(data.schedules)
    })
  })
)

module.exports = router
