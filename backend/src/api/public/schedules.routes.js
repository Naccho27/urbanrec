'use strict'

const { Router }    = require('express')
const { query }     = require('express-validator')
const asyncWrapper  = require('../../shared/middlewares/asyncWrapper')
const validate      = require('../../shared/middlewares/validate.middleware')
const { ok }        = require('../../shared/utils/responses')
const cache         = require('../../shared/services/cache.service')
const scheduleModel = require('../../modules/schedules/models/schedule.model')
const { SHIFT_NAMES, daysLabel, hhmm, nextCollection } = require('../../shared/utils/schedule-format')

const router = Router()

// Los cronogramas cambian muy poco: se cachean 1 hora por barrio.
// schedules.service y collection-routes.service invalidan el caché
// cuando se crea, modifica o desactiva un cronograma o un recorrido.
const PUBLIC_SCHEDULES_TTL = 3600

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
