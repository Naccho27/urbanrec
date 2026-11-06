'use strict'

// ─────────────────────────────────────────────────────────
// GENERADOR DE HISTÓRICO SINTÉTICO — UrbanRec
//
// Simula meses de operación de Cotreco S.A. sobre los recorridos y
// cronogramas reales cargados en la base, para:
//   - alimentar dashboards, analytics y exportaciones con volumen real
//   - entrenar y VALIDAR la IA: los patrones se inyectan a propósito
//     (ver history/scenario.js), así se puede comprobar si el sistema
//     los detecta. Es validación del pipeline con verdad conocida, no
//     una afirmación sobre el comportamiento real de Cotreco.
//
// Uso (desde la carpeta backend):
//   node db/seeds/generate-history.js --dry-run   simula y muestra estadísticas, no escribe
//   node db/seeds/generate-history.js             genera e inserta
//   node db/seeds/generate-history.js --clean     borra todo lo generado
//   node db/seeds/generate-history.js --reset     borra y vuelve a generar
//
// Opciones:
//   --seed=2026          semilla (misma semilla + mismas fechas = mismos datos)
//   --from=AAAA-MM-DD    primer día simulado (por defecto: to − 212 días)
//   --to=AAAA-MM-DD      último día simulado (por defecto: ayer)
//   --no-today           no crear las ejecuciones de hoy en estado 'assigned'
//
// Todo lo generado queda marcado: las ejecuciones con "[SIM]" al inicio
// de notes y los conductores nuevos con email @cotreco.test. Inserta
// directo en la base (no pasa por la API) para no llenar audit_logs con
// miles de acciones que nadie hizo.
// ─────────────────────────────────────────────────────────

const path   = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })

const mysql  = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const S   = require('./history/scenario')
const geo = require('./history/geo')
const { createRng } = require('./history/rng')

// ── Argumentos de línea de comandos ──────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`))
  return found ? found.split('=')[1] : null
}

// ── Fechas (siempre en hora local, como el pool del backend) ──
const DAY_MS = 24 * 60 * 60 * 1000

const parseDate = (str) => {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const ymd = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
const addMin = (date, min) => new Date(date.getTime() + Math.round(min * 60000))
const at = (dateStr, time) => {
  const [h, mi, s] = String(time).split(':').map(Number)
  const base = parseDate(dateStr)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, mi || 0, s || 0)
}
// Día ISO: 1 = lunes … 7 = domingo (misma convención que schedules.week_days)
const isoDay = (date) => ((date.getDay() + 6) % 7) + 1
const month = (dateStr) => Number(dateStr.slice(5, 7))
const mmdd = (dateStr) => dateStr.slice(5)
const inRange = (dateStr, from, to) => dateStr >= from && dateStr <= to
const minutesBetween = (a, b) => (b.getTime() - a.getTime()) / 60000

// ── Conexión ─────────────────────────────────────────────
// Pool propio (no se reutiliza config/db.js porque ese módulo corta el
// proceso si faltan variables del servidor como JWT_SECRET)
const createPool = () => mysql.createPool({
  host:            process.env.DB_HOST,
  port:            parseInt(process.env.DB_PORT || '3306', 10),
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,
  database:        process.env.DB_NAME,
  timezone:        'local',
  connectionLimit: 2
})

// ═════════════════════════════════════════════════════════
// 1. CARGA DEL CONTEXTO REAL (recorridos, barrios, cronogramas)
// ═════════════════════════════════════════════════════════
const loadContext = async (pool) => {
  // Usuarios existentes que se necesitan
  const emails = Object.values(S.EXISTING_USERS)
  const [userRows] = await pool.query(
    'SELECT id, email, company_id FROM users WHERE email IN (?)', [emails]
  )
  const users = {}
  for (const [key, email] of Object.entries(S.EXISTING_USERS)) {
    const row = userRows.find(u => u.email === email)
    if (!row) throw new Error(`Falta el usuario ${email}. Crealo antes de generar el histórico.`)
    users[key] = row
  }

  // Recorridos del escenario con sus barrios en orden de visita
  const [routeRows] = await pool.query(
    `SELECT id, name, company_id, distance_km, duration_min
     FROM collection_routes
     WHERE name IN (?) AND is_active = TRUE`,
    [Object.keys(S.ROUTES)]
  )
  if (routeRows.length !== Object.keys(S.ROUTES).length) {
    const found = routeRows.map(r => r.name)
    const missing = Object.keys(S.ROUTES).filter(n => !found.includes(n))
    throw new Error(`Faltan recorridos: ${missing.join(', ')}. ¿Corriste las migraciones 013 y 014?`)
  }

  const routes = {}
  for (const r of routeRows) {
    const [zoneRows] = await pool.query(
      `SELECT z.id, z.name, z.center_lat, z.center_lng, z.geojson, rz.visit_order
       FROM route_zones rz
       INNER JOIN zones z ON z.id = rz.zone_id
       WHERE rz.collection_route_id = ? AND z.is_active = TRUE
       ORDER BY rz.visit_order ASC`,
      [r.id]
    )
    routes[r.id] = {
      ...r,
      key: S.ROUTES[r.name],
      distance_km: parseFloat(r.distance_km),
      zones: zoneRows.map(prepareZone)
    }
  }

  // Cronogramas activos de esos recorridos
  const [scheduleRows] = await pool.query(
    `SELECT id, collection_route_id, company_id, shift, week_days,
            start_time, end_time, valid_from, valid_until
     FROM schedules
     WHERE collection_route_id IN (?) AND is_active = TRUE`,
    [routeRows.map(r => r.id)]
  )
  const schedules = scheduleRows.map(s => ({
    ...s,
    week_days: typeof s.week_days === 'string' ? JSON.parse(s.week_days) : s.week_days,
    valid_from: s.valid_from instanceof Date ? ymd(s.valid_from) : String(s.valid_from).slice(0, 10),
    valid_until: s.valid_until
      ? (s.valid_until instanceof Date ? ymd(s.valid_until) : String(s.valid_until).slice(0, 10))
      : null,
    route: routes[s.collection_route_id]
  }))

  // Ejecuciones que ya existen (cargadas a mano): no se duplican
  const [existingRows] = await pool.query(
    'SELECT schedule_id, execution_date FROM route_executions'
  )
  const existing = new Set(existingRows.map(e =>
    `${e.schedule_id}|${e.execution_date instanceof Date ? ymd(e.execution_date) : String(e.execution_date).slice(0, 10)}`
  ))

  // Tiempo base de cada barrio dentro de su recorrido
  for (const route of Object.values(routes)) computeZoneBaseTimes(route, schedules)

  return { users, routes, schedules, existing }
}

// Agrega al barrio su geometría y su clasificación (centro / periferia / ribereño)
const prepareZone = (row) => {
  const ring = geo.outerRing(row.geojson)
  const center = { lat: parseFloat(row.center_lat), lng: parseFloat(row.center_lng) }
  const distToCenter = geo.distanceKm(center, S.PLACES.cityCenter)
  const isCentro = row.name.startsWith('CENTRO ')
  return {
    id: row.id,
    name: row.name,
    center,
    ring,
    bbox: ring.length ? geo.boundingBox(ring) : {
      minLat: center.lat - 0.003, maxLat: center.lat + 0.003,
      minLng: center.lng - 0.003, maxLng: center.lng + 0.003
    },
    areaM2: geo.areaM2(ring),
    distToCenterKm: distToCenter,
    isCentro,
    isPeriphery: !isCentro && distToCenter >= S.EFFECTS.peripheryKm,
    isRiverside: S.EFFECTS.riverside.includes(row.name)
  }
}

// Reparte la duración planificada del recorrido entre sus barrios.
// Peso de cada barrio = raíz del área × densidad (los barrios grandes
// llevan más tiempo, pero no en proporción directa porque suelen
// incluir terrenos vacíos).
const computeZoneBaseTimes = (route, schedules) => {
  const T = S.TIMING
  const n = route.zones.length
  const avgTransit = (T.transitMin[0] + T.transitMin[1]) / 2
  const avgDump = (T.dumpMin[0] + T.dumpMin[1]) / 2
  const budget = route.duration_min - T.baseExitMin - avgTransit * (n - 1) - avgDump

  const weights = route.zones.map(z =>
    Math.sqrt(Math.max(z.areaM2, 50000)) * (z.isCentro ? S.DENSITY.centro : S.DENSITY.default)
  )
  const total = weights.reduce((a, b) => a + b, 0)

  // Carga "normal" de un barrio: lo que se acumula entre dos servicios
  // promedio según cuántas veces por semana pasa el camión
  const schedule = schedules.find(s => s.collection_route_id === route.id)
  const servicesPerWeek = schedule ? schedule.week_days.length : 3
  const avgDailyGen = (5 + 2 * S.WASTE.weekendFactor) / 7

  route.zones.forEach((z, i) => {
    z.baseMin = budget * weights[i] / total
    z.share = weights[i] / total
    z.nominalLoad = avgDailyGen * 7 / servicesPerWeek
    z.pending = z.nominalLoad   // se arranca como si el servicio venía normal
  })
}

// ═════════════════════════════════════════════════════════
// 2. CLIMA DIARIO (cadena de Markov con climatología por mes)
// ═════════════════════════════════════════════════════════
const buildWeather = (dates, rng) => {
  const C = S.CLIMATE
  const weather = {}
  let rainedYesterday = false
  let heavyYesterday = false

  for (const d of dates) {
    const m = month(d)
    const share = C.rainyDayShare[m] ?? 0.12
    // Probabilidad de lluvia si ayer NO llovió, despejada para que el
    // promedio del mes coincida con la climatología:
    //   share = share·persistence + (1 − share)·pDry
    const pDry = Math.max(0, (share - share * C.persistence) / (1 - share))
    const rains = rng.chance(rainedYesterday ? C.persistence : pDry)
    const heavy = rains && rng.chance(C.heavyShare[m] ?? 0.35)
    weather[d] = {
      rain: rains ? (heavy ? 'heavy' : 'light') : 'none',
      windy: heavy && rng.chance(C.windyStormProb),
      afterHeavy: heavyYesterday && !heavy
    }
    rainedYesterday = rains
    heavyYesterday = heavy
  }

  // "Viento ayer" sirve para las ramas caídas del día siguiente
  dates.forEach((d, i) => {
    weather[d].afterWindstorm = i > 0 && weather[dates[i - 1]].windy
  })
  return weather
}

// ═════════════════════════════════════════════════════════
// 3. CONDUCTORES: ausencias y asignación diaria
// ═════════════════════════════════════════════════════════
const buildAbsences = (dates, rng) => {
  const absences = {}
  for (const c of S.CONDUCTORS) {
    const set = new Set()
    // Vacaciones
    if (c.vacation) {
      for (const d of dates) if (inRange(d, c.vacation[0], c.vacation[1])) set.add(d)
    }
    // Enfermedad / trámites: rachas de 1 a 3 días
    for (let i = 0; i < dates.length; i++) {
      if (!set.has(dates[i]) && rng.chance(S.DAILY_ABSENCE_PROB)) {
        const len = rng.int(1, 3)
        for (let k = 0; k < len && i + k < dates.length; k++) set.add(dates[i + k])
      }
    }
    absences[c.key] = set
  }
  return absences
}

const createAssigner = (absences) => {
  const worked = {}   // fecha → Map(conductor → turno)

  const shiftOn = (key, date) => worked[date]?.get(key) || null

  const canWork = (c, date, shift, allowOtherShift) => {
    if (absences[c.key]?.has(date)) return false
    if (shiftOn(c.key, date)) return false                           // un recorrido por día
    if (!allowOtherShift && c.shift !== 'both' && c.shift !== shift) return false
    // Descanso mínimo de 12 h entre jornadas
    const prev = ymd(addDays(parseDate(date), -1))
    if (shift === 'morning' && shiftOn(c.key, prev) === 'night') return false
    if (shift === 'night' && shiftOn(c.key, date) === 'morning') return false
    return true
  }

  const mark = (c, date, shift) => {
    if (!worked[date]) worked[date] = new Map()
    worked[date].set(c.key, shift)
  }

  // Devuelve { conductor, isTitular } o null si nadie puede
  const assign = (routeKey, date, shift) => {
    const day = isoDay(parseDate(date))
    const titular = S.CONDUCTORS.find(c => c.titular[routeKey]?.includes(day))
    const candidates = [
      titular && { list: [titular], other: false },
      { list: S.CONDUCTORS.filter(c => c.relief), other: false },                  // franquero
      { list: S.CONDUCTORS.filter(c => c !== titular && c.shift === shift), other: false },
      { list: S.CONDUCTORS.filter(c => c !== titular), other: true }               // último recurso
    ].filter(Boolean)

    for (const { list, other } of candidates) {
      const c = list.find(x => canWork(x, date, shift, other))
      if (c) {
        mark(c, date, shift)
        return { conductor: c, isTitular: c === titular }
      }
    }
    return null
  }

  return { assign, titularFor: (routeKey, date) =>
    S.CONDUCTORS.find(c => c.titular[routeKey]?.includes(isoDay(parseDate(date)))) }
}

// ═════════════════════════════════════════════════════════
// 4. TEXTOS de incidentes y resoluciones
// ═════════════════════════════════════════════════════════
const TEXTS = {
  weather: [
    'Tormenta fuerte: calles anegadas, no se pudo ingresar al barrio',
    'Lluvia intensa: el camión no puede circular por calles de tierra',
    'Temporal con anegamientos, se suspende la recolección en el sector'
  ],
  mud: [
    'Calles de tierra con barro después de la lluvia, riesgo de que el camión se encaje',
    'Barro en calles sin pavimentar, no se pudo completar el ingreso',
    'Calle de tierra intransitable tras la lluvia del día anterior'
  ],
  blockedCentro: [
    'Vehículos mal estacionados en calle angosta, el camión no puede pasar',
    'Doble fila de autos estacionados impide el paso del camión',
    'Auto estacionado en esquina, no se puede doblar con el camión'
  ],
  blockedNarrow: [
    'Calle angosta con autos a ambos lados, se tuvo que rodear la manzana',
    'Vehículo mal estacionado bloquea la calle'
  ],
  improper: [
    'Restos de poda en vereda: requiere operativo especial de ramas',
    'Escombros de obra en la vereda: no corresponden a recolección domiciliaria',
    'Residuos voluminosos (muebles, colchón) fuera del horario de recolección especial',
    'Ramas caídas por el viento obstruyen la vereda'
  ],
  noWaste: [
    'Los vecinos no sacaron los residuos en el horario del servicio',
    'Sin residuos en la vía pública al pasar el camión'
  ],
  breakdown: [
    'Falla mecánica en el sistema hidráulico de la compactadora',
    'Pinchadura de neumático trasero',
    'Problema eléctrico en el camión, no arranca',
    'Pérdida de aceite hidráulico, se detiene la unidad'
  ],
  resolution: {
    weather: ['Se reprogramó el barrio para el siguiente servicio', 'Recolección completada en el turno siguiente'],
    inaccessible_zone: ['Se reprogramó el barrio cuando mejoraron las calles', 'Se coordinó con Obras Públicas el mejorado de la calle'],
    blocked_street: ['Se coordinó con Tránsito el control de estacionamiento', 'Se recolectó rodeando la manzana', 'Se informó el corte a Cotreco para ajustar el recorrido'],
    other: ['Derivado a operativo especial de poda y escombros', 'Se notificó al vecino sobre el servicio de recolección diferenciada'],
    no_waste: ['Se informó a los vecinos los días y horarios de recolección'],
    vehicle_issue: ['Unidad reparada en taller de Cotreco', 'Se reemplazó la unidad por una de refuerzo']
  }
}

// ═════════════════════════════════════════════════════════
// 5. SIMULACIÓN
// ═════════════════════════════════════════════════════════
const simulate = (ctx, { from, to, includeToday, seed }) => {
  const rngWeather = createRng(seed)
  const rngPeople  = createRng(seed + 1)
  const rng        = createRng(seed + 2)   // operación
  const rngGps     = createRng(seed + 3)

  const dates = []
  for (let d = parseDate(from); ymd(d) <= to; d = addDays(d, 1)) dates.push(ymd(d))
  const today = ymd(addDays(parseDate(to), 1))
  const gpsFrom = ymd(addDays(parseDate(to), -(S.GPS_DAYS - 1)))

  const weather  = buildWeather(dates, rngWeather)
  const absences = buildAbsences([...dates, today], rngPeople)
  const assigner = createAssigner(absences)

  const executions = []   // cada una lleva sus visitas, incidentes y puntos GPS
  const allZones = Object.values(ctx.routes).flatMap(r => r.zones)
  let lastMaintenance = from

  // Orden dentro del día: mañana → tarde → noche
  const shiftOrder = { morning: 0, afternoon: 1, night: 2 }

  for (const date of dates) {
    const dObj = parseDate(date)
    const day = isoDay(dObj)
    const m = month(date)
    const holiday = S.HOLIDAYS[date]
    const labor = S.LABOR_EVENTS[date]
    const w = weather[date]

    if (S.FLEET.maintenanceDates.includes(date)) lastMaintenance = date

    // Se genera basura todos los días en todos los barrios
    const gen = (S.WASTE.monthFactor[m] ?? 1) *
                (day >= 6 ? S.WASTE.weekendFactor : 1) *
                (holiday ? S.WASTE.holidayFactor : 1)
    for (const z of allZones) z.pending = Math.min(z.pending + gen, z.nominalLoad * S.WASTE.maxLoad)

    const todays = ctx.schedules
      .filter(s => s.week_days.includes(day))
      .filter(s => date >= s.valid_from && (!s.valid_until || date <= s.valid_until))
      .sort((a, b) => shiftOrder[a.shift] - shiftOrder[b.shift])

    for (const schedule of todays) {
      if (ctx.existing.has(`${schedule.id}|${date}`)) continue
      const exec = simulateExecution({
        ctx, schedule, date, day, m, holiday, labor, w, rng, rngGps, assigner,
        wearDays: (parseDate(date) - parseDate(lastMaintenance)) / DAY_MS,
        withGps: date >= gpsFrom
      })
      executions.push(exec)
    }
  }

  // Ejecuciones de HOY: programadas y asignadas, sin iniciar
  // (sirven para probar el flujo del conductor en la PWA)
  if (includeToday) {
    const day = isoDay(parseDate(today))
    for (const schedule of ctx.schedules) {
      if (!schedule.week_days.includes(day)) continue
      if (today < schedule.valid_from || (schedule.valid_until && today > schedule.valid_until)) continue
      if (ctx.existing.has(`${schedule.id}|${today}`)) continue
      const a = assigner.assign(schedule.route.key, today, schedule.shift)
      executions.push(baseExecution(schedule, today, {
        status: 'assigned',
        conductor: a?.conductor || null,
        notes: ['Programado']
      }))
    }
  }

  return { executions, weather, dates, today }
}

// Estructura común de una ejecución
const baseExecution = (schedule, date, { status, conductor, notes }) => ({
  schedule_id: schedule.id,
  collection_route_id: schedule.collection_route_id,
  company_id: schedule.company_id,
  conductorKey: conductor?.key || null,
  execution_date: date,
  status,
  started_at: null,
  paused_at: null,
  completed_at: null,
  completion_pct: 0,
  zones_total: schedule.route.zones.length,
  zones_visited: 0,
  distance_covered_km: null,
  notes,
  created_at: at(ymd(addDays(parseDate(date), -1)), '18:00:00'),
  routeKey: schedule.route.key,
  shift: schedule.shift,
  visits: [],
  incidents: [],
  gps: []
})

const simulateExecution = (p) => {
  const { schedule, date, day, m, holiday, labor, w, rng, rngGps, assigner } = p
  const E = S.EFFECTS
  const T = S.TIMING
  const route = schedule.route
  const isNight = schedule.shift === 'night'
  const isWinter = E.winterMonths.includes(m)

  // ── Antes de salir ─────────────────────────────────────
  if (holiday?.policy === 'no_service') {
    return baseExecution(schedule, date, {
      status: 'cancelled', conductor: null,
      notes: [`Feriado ${holiday.name}: sin servicio`]
    })
  }

  const assignment = assigner.assign(route.key, date, schedule.shift)

  if (labor?.type === 'strike') {
    return baseExecution(schedule, date, {
      status: 'cancelled', conductor: assignment?.conductor || null,
      notes: [labor.label]
    })
  }
  if (!assignment) {
    return baseExecution(schedule, date, {
      status: 'cancelled', conductor: null,
      notes: ['Sin conductor disponible (licencias y francos superpuestos)']
    })
  }

  const conductor = assignment.conductor
  const exec = baseExecution(schedule, date, { status: 'in_progress', conductor, notes: [] })
  const scheduledStart = at(date, schedule.start_time)

  const breakdownProb = S.FLEET.baseBreakdownProb + S.FLEET.wearPerDay * p.wearDays
  let startDelay = Math.max(0, rng.normal(T.startDelay.mean, T.startDelay.sd))

  // Rotura antes de salir
  if (rng.chance(breakdownProb * S.FLEET.preStartShare)) {
    const incident = {
      type: 'vehicle_issue', zone: null, place: S.PLACES.base,
      description: `${rng.pick(TEXTS.breakdown)} (antes de salir de la base)`
    }
    if (rng.chance(S.FLEET.reinforcementProb)) {
      startDelay += rng.uniform(...S.FLEET.reinforcementDelayMin)
      exec.notes.push('Salida demorada: se esperó unidad de refuerzo')
      incident.time = addMin(scheduledStart, 5)
      exec.incidents.push(incident)
    } else {
      exec.status = 'cancelled'
      exec.notes.push('Unidad fuera de servicio y sin unidad de refuerzo disponible')
      incident.time = addMin(scheduledStart, 5)
      exec.incidents.push(incident)
      return exec
    }
  }

  // Demoras de salida
  if (labor?.type === 'assembly') { startDelay += labor.delayMin; exec.notes.push(labor.label) }
  if (holiday) { startDelay += rng.uniform(...E.holidayDelayMin); exec.notes.push(`Feriado ${holiday.name}: guardia reducida`) }
  if (isWinter && isNight) startDelay += rng.uniform(...E.winterNightDelayMin)
  if (isWinter && !isNight && rng.chance(E.winterFogMorningProb)) {
    startDelay += rng.uniform(...E.winterFogDelayMin)
  }

  const start = addMin(scheduledStart, startDelay)
  exec.started_at = start

  // Factor global de rendimiento de esta salida
  let factor = conductor.skill * (assignment.isTitular ? 1 : S.NON_TITULAR_FACTOR)
  if (w.rain === 'light') factor *= E.lightRainFactor
  if (w.rain === 'heavy') factor *= E.heavyRainFactor
  if (isWinter && isNight) factor *= E.winterNightFactor
  if (holiday) factor *= E.holidayFactor
  if (!assignment.isTitular) exec.notes.push('Conductor reemplazante')

  // Carga total → ¿hace falta una segunda descarga?
  const loads = route.zones.map(z => z.pending / z.nominalLoad)
  const totalLoad = route.zones.reduce((s, z, i) => s + z.share * loads[i], 0)
  const n = route.zones.length
  const dumpAfter = totalLoad > T.extraDumpLoad
    ? new Set([Math.floor(n / 3) - 1, Math.floor(2 * n / 3) - 1].map(i => Math.max(0, i)))
    : new Set([Math.floor(n / 2) - 1].map(i => Math.max(0, i)))
  if (totalLoad > T.extraDumpLoad) exec.notes.push('Volumen elevado: se realizaron dos descargas')

  // Rotura en ruta: ¿antes de qué barrio?
  const breakdownAt = rng.chance(breakdownProb * (1 - S.FLEET.preStartShare)) ? rng.int(0, n - 1) : -1

  // ── Recorrido ──────────────────────────────────────────
  const timeline = []          // segmentos para el rastro GPS
  let t = start
  let pos = S.PLACES.base
  let extraKm = 0
  let visitedShare = 0
  let dumps = 0

  const travel = (to, minutes) => {
    timeline.push({ kind: 'travel', from: pos, to, t0: t, t1: addMin(t, minutes) })
    t = addMin(t, minutes)
    pos = to
  }
  const stop = (minutes, kind = 'stop') => {
    timeline.push({ kind, at: pos, t0: t, t1: addMin(t, minutes) })
    t = addMin(t, minutes)
  }
  const addIncident = (type, zone, description, time) => {
    exec.incidents.push({
      type, zone, description, time,
      place: zone ? geo.randomPointIn(zone, rng) : pos
    })
  }

  travel(route.zones[0].center, T.baseExitMin)

  for (let i = 0; i < n; i++) {
    const z = route.zones[i]

    // Rotura en ruta
    if (i === breakdownAt) {
      addIncident('vehicle_issue', z, rng.pick(TEXTS.breakdown), t)
      if (rng.chance(S.FLEET.reinforcementProb)) {
        exec.paused_at = t
        stop(rng.uniform(...S.FLEET.reinforcementDelayMin), 'pause')
        exec.notes.push('Rotura en ruta: se continuó con unidad de refuerzo')
      } else {
        exec.paused_at = t
        exec.notes.push('Rotura en ruta sin unidad de refuerzo: barrios restantes reprogramados')
        break
      }
    }

    // Tiempo de recolección del barrio según la basura acumulada
    const load = z.pending / z.nominalLoad
    let zoneMin = z.baseMin *
      (T.fixedShare + (1 - T.fixedShare) * Math.pow(load, S.WASTE.loadElasticity)) *
      factor * rng.noise(T.timeNoise)

    // Fin de turno: si no alcanza, el barrio queda pendiente
    if (minutesBetween(start, t) + zoneMin > T.shiftLimitMin) {
      exec.notes.push(`Fin de turno: ${n - i} barrio(s) sin recolectar, se reprograman`)
      break
    }

    // ── Imprevistos que impiden entrar al barrio ──
    let skip = false
    if (w.rain === 'heavy' && (z.isPeriphery || z.isRiverside)) {
      const p = z.isRiverside ? E.riversideHeavyRainSkipProb : E.heavyRainSkipProb
      if (rng.chance(p)) {
        addIncident('weather', z, rng.pick(TEXTS.weather), t)
        skip = true
      }
    } else if (w.afterHeavy && z.isPeriphery && rng.chance(E.dayAfterHeavyRainSkipProb)) {
      addIncident('inaccessible_zone', z, rng.pick(TEXTS.mud), t)
      skip = true
    }

    if (skip) {
      // Intenta entrar, no puede, sigue
      stop(rng.uniform(5, 10))
    } else {
      // Obras, autos mal estacionados, residuos indebidos, sin residuos
      let delay = 0
      const work = S.ROADWORKS.find(r => r.zone === z.name && inRange(date, r.from, r.to))
      const fridayNight = isNight && day === 5
      const blockedProb = work ? work.prob
        : z.isCentro && isNight ? E.centroBlockedProb * (fridayNight ? E.fridayNightMultiplier : 1)
        : E.narrowStreetZones.includes(z.name) ? E.narrowStreetProb
        : 0
      if (blockedProb && rng.chance(blockedProb)) {
        const text = work ? work.label
          : z.isCentro ? rng.pick(TEXTS.blockedCentro) : rng.pick(TEXTS.blockedNarrow)
        addIncident('blocked_street', z, text, addMin(t, zoneMin * rng.uniform(0.1, 0.8)))
        delay += rng.uniform(...E.blockedDelayMin)
        extraKm += rng.uniform(0.3, 1.2)
      }

      const inPruning = mmdd(date) >= E.pruningSeason[0] && mmdd(date) <= E.pruningSeason[1]
      const improperProb = z.isCentro ? E.improperWasteProb / 2
        : w.afterWindstorm ? E.afterWindstormProb
        : inPruning ? E.pruningProb
        : E.improperWasteProb
      if (rng.chance(improperProb)) {
        const text = w.afterWindstorm ? TEXTS.improper[3] : rng.pick(TEXTS.improper.slice(0, 3))
        addIncident('other', z, text, addMin(t, zoneMin * rng.uniform(0.1, 0.9)))
        delay += rng.uniform(...E.improperDelayMin)
      }

      if (!z.isCentro && rng.chance(E.noWasteProb)) {
        addIncident('no_waste', z, rng.pick(TEXTS.noWaste), addMin(t, zoneMin * 0.5))
        zoneMin *= 0.7
      }

      // Visita del barrio (se marca al llegar, como hace el tracking por proximidad)
      const offline = z.isPeriphery && rng.chance(E.offlineZoneProb)
      const manual = offline ? rngGps.chance(0.5) : rngGps.chance(E.manualVisitProb)
      exec.visits.push({
        zone_id: z.id,
        method: manual ? 'manual' : 'auto',
        visited_at: t,
        notes: manual ? (offline ? 'Confirmada manualmente: sin señal GPS en el sector' : 'Confirmada manualmente por el conductor') : null
      })
      timeline.push({ kind: 'zone', zone: z, t0: t, t1: addMin(t, zoneMin + delay), offline })
      t = addMin(t, zoneMin + delay)
      z.pending = 0
      visitedShare += z.share
    }

    // Descarga intermedia
    if (dumpAfter.has(i) && i < n - 1) {
      const dumpMin = rng.uniform(...T.dumpMin)
      timeline.push({ kind: 'dump', from: pos, t0: t, t1: addMin(t, dumpMin) })
      t = addMin(t, dumpMin)
      dumps++
      if (dumps > 1) extraKm += 7   // la primera descarga ya está en la distancia planificada
    }

    // Traslado al siguiente barrio
    if (i < n - 1) travel(route.zones[i + 1].center, rng.uniform(...T.transitMin))
  }

  // ── Cierre ─────────────────────────────────────────────
  exec.completed_at = t
  exec.zones_visited = exec.visits.length
  exec.completion_pct = Math.round(exec.zones_visited / n * 10000) / 100
  exec.distance_covered_km = Math.round(
    (route.distance_km * (0.15 + 0.85 * visitedShare) * rng.uniform(0.97, 1.05) + extraKm) * 100
  ) / 100
  exec.status = exec.zones_visited === n && exec.incidents.length === 0 ? 'completed' : 'with_issues'

  if (minutesBetween(scheduledStart, t) > 480) {
    exec.notes.push('Finalizó fuera del horario del turno')
  }
  if (w.rain !== 'none') exec.notes.push(w.rain === 'heavy' ? 'Tormenta durante el turno' : 'Lluvia durante el turno')

  if (p.withGps) exec.gps = buildGps(timeline, exec, rngGps)
  return exec
}

// ═════════════════════════════════════════════════════════
// 6. RASTRO GPS (1 punto por minuto, solo los últimos días)
// ═════════════════════════════════════════════════════════
const buildGps = (timeline, exec, rng) => {
  const points = []
  if (!timeline.length) return points
  const start = timeline[0].t0
  const end = timeline[timeline.length - 1].t1
  let prev = null
  let seg = 0

  for (let t = start; t <= end; t = addMin(t, 1)) {
    while (seg < timeline.length - 1 && t > timeline[seg].t1) seg++
    const s = timeline[seg]
    const total = Math.max(0.001, minutesBetween(s.t0, s.t1))
    const k = Math.min(1, Math.max(0, minutesBetween(s.t0, t) / total))
    let p
    let offline = false
    let periphery = false

    if (s.kind === 'travel') {
      p = geo.lerp(s.from, s.to, k)
    } else if (s.kind === 'zone') {
      const hours = total / 60
      const rows = Math.max(1, Math.round(S.TIMING.collectionSpeedKmh * hours / Math.max(0.2, geo.widthKm(s.zone.bbox))))
      p = geo.sweepPosition(s.zone, k, rows)
      offline = s.offline
      periphery = s.zone.isPeriphery
    } else if (s.kind === 'dump') {
      // va al punto de descarga, descarga y vuelve
      p = k < 0.4 ? geo.lerp(s.from, S.PLACES.disposal, k / 0.4)
        : k < 0.6 ? S.PLACES.disposal
        : geo.lerp(S.PLACES.disposal, s.from, (k - 0.6) / 0.4)
    } else {
      p = s.at   // parado (pausa, calle cortada)
    }

    p = geo.jitter(p, periphery ? 8 : 4, rng)
    const speed = prev ? Math.min(60, geo.distanceKm(prev, p) * 60) : 0
    points.push({
      latitude: p.lat.toFixed(7),
      longitude: p.lng.toFixed(7),
      accuracy_meters: (periphery ? rng.uniform(6, 20) : rng.uniform(3, 10)).toFixed(2),
      speed_kmh: speed < 1.5 ? '0.00' : speed.toFixed(2),
      heading: prev && speed >= 1.5 ? geo.bearing(prev, p).toFixed(2) : null,
      recorded_at: t,
      synced_at: offline ? addMin(s.t1, rng.uniform(1, 4)) : new Date(t.getTime() + rng.int(2, 6) * 1000),
      is_offline_sync: offline ? 1 : 0
    })
    prev = p
  }
  return points
}

// ═════════════════════════════════════════════════════════
// 7. ESTADO DE LOS INCIDENTES (resueltos / en revisión / abiertos)
// ═════════════════════════════════════════════════════════
const ageIncidents = (executions, ctx, to, rng) => {
  const ref = addDays(parseDate(to), 1)   // "ahora" de la simulación
  const A = S.INCIDENT_AGING
  for (const exec of executions) {
    for (const inc of exec.incidents) {
      const daysAgo = (ref - inc.time) / DAY_MS
      const odds = daysAgo <= A.recentDays ? A.recent : daysAgo <= A.mediumDays ? A.medium : { open: 0, reviewing: 0 }
      const r = rng.next()
      inc.status = r < odds.open ? 'open' : r < odds.open + odds.reviewing ? 'reviewing' : 'resolved'
      if (inc.status === 'resolved') {
        // Municipio resuelve lo de vía pública; la empresa lo de su flota
        const byCompany = inc.type === 'vehicle_issue' || inc.type === 'no_waste'
        inc.resolved_by = byCompany ? ctx.users.operator.id : ctx.users.municipal.id
        const resolvedAt = addMin(inc.time, rng.uniform(90, 3 * 24 * 60))
        inc.resolved_at = resolvedAt > ref ? addMin(ref, -rng.uniform(30, 300)) : resolvedAt
        inc.resolution_notes = rng.pick(TEXTS.resolution[inc.type])
      }
    }
  }
}

// ═════════════════════════════════════════════════════════
// 8. INSERCIÓN EN LA BASE
// ═════════════════════════════════════════════════════════
const ensureConductors = async (conn, ctx, to) => {
  const ids = {}
  const hash = await bcrypt.hash(S.SIM_CONDUCTOR_PASSWORD, 12)
  const licenseSoon = ymd(addDays(parseDate(to), 21))   // ~20 días desde "hoy"

  for (const c of S.CONDUCTORS) {
    if (c.existing) { ids[c.key] = ctx.users[c.existing].id; continue }
    const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [c.email])
    if (rows.length) { ids[c.key] = rows[0].id; continue }
    const [res] = await conn.query(
      `INSERT INTO users
        (name, email, password_hash, role, company_id, license_number, license_expiry, is_active, created_at)
       VALUES (?, ?, ?, 'conductor', ?, ?, ?, TRUE, ?)`,
      [
        c.name, c.email, hash, ctx.users.operator.company_id,
        c.license_number,
        c.license_expiry === 'TO_PLUS_20_DAYS' ? licenseSoon : c.license_expiry,
        at('2026-03-20', '10:00:00')
      ]
    )
    ids[c.key] = res.insertId
  }
  return ids
}

// Inserta filas en lotes (un INSERT con muchos VALUES es mucho más rápido)
const bulkInsert = async (conn, table, columns, rows, chunk = 1000) => {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    await conn.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [part])
  }
}

const insertAll = async (pool, ctx, sim, to) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const conductorIds = await ensureConductors(conn, ctx, to)

    const visits = []
    const incidents = []
    const gps = []

    for (const e of sim.executions) {
      const conductorId = e.conductorKey ? conductorIds[e.conductorKey] : null
      const [res] = await conn.query(
        `INSERT INTO route_executions
          (schedule_id, collection_route_id, company_id, conductor_id, execution_date, status,
           started_at, paused_at, completed_at, completion_pct, zones_total, zones_visited,
           distance_covered_km, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.schedule_id, e.collection_route_id, e.company_id, conductorId, e.execution_date, e.status,
          e.started_at, e.paused_at, e.completed_at, e.completion_pct, e.zones_total, e.zones_visited,
          e.distance_covered_km, `${S.SIM_TAG} ${e.notes.join('. ')}`.trim(),
          e.created_at, e.completed_at || e.created_at
        ]
      )
      const execId = res.insertId

      for (const v of e.visits) visits.push([execId, v.zone_id, v.method, v.visited_at, v.notes])
      for (const i of e.incidents) {
        incidents.push([
          execId, conductorId, e.company_id, i.zone?.id || null, i.type, i.description,
          i.place.lat.toFixed(7), i.place.lng.toFixed(7), i.status,
          i.resolved_by || null, i.resolved_at || null, i.resolution_notes || null,
          i.time, i.resolved_at || i.time
        ])
      }
      for (const g of e.gps) {
        gps.push([execId, conductorId, g.latitude, g.longitude, g.accuracy_meters,
          g.speed_kmh, g.heading, g.recorded_at, g.synced_at, g.is_offline_sync])
      }
    }

    await bulkInsert(conn, 'zone_visits',
      ['execution_id', 'zone_id', 'method', 'visited_at', 'notes'], visits)
    await bulkInsert(conn, 'incidents',
      ['execution_id', 'conductor_id', 'company_id', 'zone_id', 'type', 'description',
       'latitude', 'longitude', 'status', 'resolved_by', 'resolved_at', 'resolution_notes',
       'created_at', 'updated_at'], incidents)
    await bulkInsert(conn, 'gps_tracking',
      ['execution_id', 'conductor_id', 'latitude', 'longitude', 'accuracy_meters',
       'speed_kmh', 'heading', 'recorded_at', 'synced_at', 'is_offline_sync'], gps)

    await conn.commit()
    return { visits: visits.length, incidents: incidents.length, gps: gps.length }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

// ═════════════════════════════════════════════════════════
// 9. LIMPIEZA (borra solo lo generado)
// ═════════════════════════════════════════════════════════
const clean = async (pool) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const tag = `${S.SIM_TAG}%`
    // incidents tiene ON DELETE RESTRICT hacia route_executions: van primero.
    // gps_tracking y zone_visits se borran solos (ON DELETE CASCADE).
    const [inc] = await conn.query(
      `DELETE i FROM incidents i
       INNER JOIN route_executions re ON re.id = i.execution_id
       WHERE re.notes LIKE ?`, [tag])
    const [exe] = await conn.query('DELETE FROM route_executions WHERE notes LIKE ?', [tag])
    await conn.commit()
    console.log(`🧹 Incidentes borrados: ${inc.affectedRows}`)
    console.log(`🧹 Ejecuciones borradas: ${exe.affectedRows} (con sus visitas y puntos GPS)`)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  // Conductores simulados: si alguno quedó referenciado por algo cargado
  // a mano (ej: resolvió un incidente real), se desactiva en vez de borrarse
  const [users] = await pool.query('SELECT id, email FROM users WHERE email LIKE ?', [`%${S.SIM_EMAIL_DOMAIN}`])
  for (const u of users) {
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [u.id])
      console.log(`🧹 Conductor borrado: ${u.email}`)
    } catch {
      await pool.query('UPDATE users SET is_active = FALSE, deleted_at = NOW() WHERE id = ?', [u.id])
      console.log(`⚠️  ${u.email} tiene datos asociados fuera de la simulación: se desactivó`)
    }
  }
}

// ═════════════════════════════════════════════════════════
// 10. RESUMEN (para verificar que los patrones quedaron)
// ═════════════════════════════════════════════════════════
const DAY_NAMES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const printSummary = (sim, ctx) => {
  const ex = sim.executions.filter(e => e.status !== 'assigned')
  const ran = ex.filter(e => e.completed_at && e.status !== 'cancelled')
  const dur = (e) => minutesBetween(e.started_at, e.completed_at)
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const fmt = (x, d = 0) => x.toFixed(d)
  const count = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc }, {})

  const rainDays = sim.dates.filter(d => sim.weather[d].rain !== 'none').length
  const heavyDays = sim.dates.filter(d => sim.weather[d].rain === 'heavy').length
  console.log(`\n📅 Período: ${sim.dates[0]} → ${sim.dates[sim.dates.length - 1]} (${sim.dates.length} días)`)
  console.log(`🌧️  Días con lluvia: ${rainDays} (tormentas fuertes: ${heavyDays})`)
  console.log(`🚛 Ejecuciones: ${ex.length} + ${sim.executions.length - ex.length} programadas para hoy`)
  console.table(count(ex, e => e.status))

  console.log('⏱️  Duración real promedio por recorrido (min) vs planificada:')
  console.table(Object.values(ctx.routes).map(r => {
    const mine = ran.filter(e => e.collection_route_id === r.id)
    return {
      recorrido: r.key,
      planificada: r.duration_min,
      real_prom: fmt(avg(mine.map(dur))),
      completitud_prom: fmt(avg(mine.map(e => e.completion_pct)), 1),
      fuera_de_turno: mine.filter(e => e.notes.some(n => n.startsWith('Finalizó fuera'))).length
    }
  }))

  console.log('📆 Por día de la semana (patrón: lunes más cargado):')
  console.table([1, 2, 3, 4, 5, 6, 7].map(d => {
    const mine = ran.filter(e => isoDay(parseDate(e.execution_date)) === d)
    return { dia: DAY_NAMES[d], ejecuciones: mine.length, duracion_prom: fmt(avg(mine.map(dur))),
      completitud: fmt(avg(mine.map(e => e.completion_pct)), 1),
      fuera_de_turno: mine.filter(e => e.notes.some(n => n.startsWith('Finalizó fuera'))).length }
  }))

  console.log('🗓️  Por mes:')
  const months = [...new Set(ex.map(e => e.execution_date.slice(0, 7)))]
  console.table(months.map(mo => {
    const all = ex.filter(e => e.execution_date.startsWith(mo))
    const mine = ran.filter(e => e.execution_date.startsWith(mo))
    const incs = all.flatMap(e => e.incidents)
    return { mes: mo, ejecuciones: all.length, canceladas: all.filter(e => e.status === 'cancelled').length,
      duracion_prom: fmt(avg(mine.map(dur))), completitud: fmt(avg(mine.map(e => e.completion_pct)), 1),
      incidentes: incs.length, roturas: incs.filter(i => i.type === 'vehicle_issue').length,
      residuos_indebidos: incs.filter(i => i.type === 'other').length }
  }))

  const incidents = ex.flatMap(e => e.incidents)
  console.log(`⚠️  Incidentes: ${incidents.length}`)
  console.table(count(incidents, i => i.type))
  console.log('📍 Barrios con más incidentes:')
  const byZone = count(incidents.filter(i => i.zone), i => i.zone.name)
  console.table(Object.entries(byZone).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([barrio, total]) => ({ barrio, total })))

  console.log('👷 Ejecuciones por conductor:')
  console.table(count(ex.filter(e => e.conductorKey), e => e.conductorKey))

  const gps = sim.executions.reduce((s, e) => s + e.gps.length, 0)
  const visits = sim.executions.reduce((s, e) => s + e.visits.length, 0)
  console.log(`🗺️  Visitas a barrios: ${visits} · Puntos GPS: ${gps}`)
}

// ═════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════
const main = async () => {
  const pool = createPool()
  try {
    if (flag('clean')) {
      await clean(pool)
      return
    }

    const [[{ simCount }]] = await pool.query(
      'SELECT COUNT(*) AS simCount FROM route_executions WHERE notes LIKE ?', [`${S.SIM_TAG}%`]
    )
    if (simCount > 0 && !flag('dry-run')) {
      if (!flag('reset')) {
        console.log(`Ya hay ${simCount} ejecuciones simuladas. Usá --reset para regenerar o --clean para borrarlas.`)
        return
      }
      await clean(pool)
    }

    const seed = parseInt(option('seed') || '2026', 10)
    const to = option('to') || ymd(addDays(new Date(), -1))
    const from = option('from') || ymd(addDays(parseDate(to), -212))

    console.log(`🎲 Semilla ${seed} · ${from} → ${to}${flag('dry-run') ? ' · SIMULACRO (no escribe)' : ''}`)

    const ctx = await loadContext(pool)
    const sim = simulate(ctx, { from, to, includeToday: !flag('no-today'), seed })
    ageIncidents(sim.executions, ctx, to, createRng(seed + 4))

    printSummary(sim, ctx)

    if (flag('dry-run')) {
      console.log('\nSimulacro terminado. No se escribió nada en la base.')
      return
    }

    const t0 = Date.now()
    const res = await insertAll(pool, ctx, sim, to)
    console.log(`\n✅ Insertado en ${((Date.now() - t0) / 1000).toFixed(1)} s: ` +
      `${sim.executions.length} ejecuciones, ${res.visits} visitas, ${res.incidents} incidentes, ${res.gps} puntos GPS`)
    console.log(`   Conductores simulados: contraseña "${S.SIM_CONDUCTOR_PASSWORD}"`)
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
