'use strict'

// ─────────────────────────────────────────────────────────
// Formato de cronogramas para mostrar al ciudadano.
// Funciones puras (sin base de datos): se usan en la ruta pública
// GET /public/schedules y se prueban en tests/unit.
// Días en formato ISO: 1 = lunes … 7 = domingo (igual que week_days).
// ─────────────────────────────────────────────────────────

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

module.exports = { DAY_NAMES, SHIFT_NAMES, daysLabel, hhmm, isoDay, ymd, nextCollection }
