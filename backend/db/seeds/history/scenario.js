'use strict'

// ─────────────────────────────────────────────────────────
// ESCENARIO DE SIMULACIÓN
//
// Acá están TODOS los supuestos y eventos con los que se genera el
// histórico sintético. Separarlos del motor de simulación permite:
//   1. Revisarlos y defenderlos uno por uno en la tesis.
//   2. Cambiar un supuesto sin tocar la lógica.
//   3. Saber exactamente qué patrones se inyectaron, para después
//      comprobar si los análisis y la IA los detectan (validación
//      del pipeline con "verdad conocida").
//
// Cada dato está etiquetado según su origen:
//   [REAL]      dato verificado (con fuente)
//   [SUPUESTO]  estimación razonable, a validar con Cotreco/Municipio
//   [SIMULADO]  evento inventado para ejercitar el sistema
// ─────────────────────────────────────────────────────────

// Marca que llevan todos los datos generados (en route_executions.notes)
// y dominio de los conductores simulados. Permiten borrarlos sin tocar
// datos cargados a mano. ".test" es un dominio reservado (RFC 2606):
// ningún mail enviado ahí sale a Internet.
const SIM_TAG = '[SIM]'
const SIM_EMAIL_DOMAIN = '@cotreco.test'

// Contraseña de los conductores simulados (para poder loguearse
// con ellos y probar la PWA del conductor)
const SIM_CONDUCTOR_PASSWORD = 'Conductor2026!'

// Usuarios existentes que se reutilizan (se buscan por email)
const EXISTING_USERS = {
  admin:     'admin@villamaria.gob.ar',
  municipal: 'mfernandez@villamaria.gob.ar',
  operator:  'cgomez@cotreco.com.ar',
  perez:     'jperez@cotreco.com.ar'
}

// Recorridos a simular: se identifican por nombre (no por id, porque
// los id cambian entre la base de desarrollo y una base nueva).
// key → clave corta usada en el resto del escenario
const ROUTES = {
  'Recorrido Norte-Oeste - Residuos Domiciliarios': 'norte_oeste',
  'Recorrido Sur-Centro - Residuos Domiciliarios':  'sur_centro',
  'Recorrido Oeste - Residuos Domiciliarios':       'oeste',
  'Recorrido Centro - Residuos Domiciliarios':      'centro',
  'Recorrido Este - Residuos Domiciliarios':        'este'
}

// ── Conductores ──────────────────────────────────────────
// [SUPUESTO] Cada recorrido tiene un conductor titular que lo conoce;
// un conductor "franquero" (Medina) cubre francos, licencias y
// vacaciones. El Centro sale 6 noches por semana, así que se reparte
// entre dos titulares. Nombres ficticios.
//   skill      → multiplicador de tiempo propio (0.97 = 3% más rápido)
//   titular    → { recorrido: [días ISO 1=lun … 7=dom] }
//   vacation   → 14 días corridos de vacaciones en el período
const CONDUCTORS = [
  {
    key: 'sosa', name: 'Roberto Sosa', email: 'rsosa' + SIM_EMAIL_DOMAIN,
    shift: 'morning', skill: 0.97,
    titular: { norte_oeste: [1, 3, 5] },
    license_number: 'SIM-LC-0001', license_expiry: '2028-03-14',
    vacation: ['2026-07-13', '2026-07-26']   // vacaciones de invierno
  },
  {
    key: 'ferreyra', name: 'Miguel Ángel Ferreyra', email: 'mferreyra' + SIM_EMAIL_DOMAIN,
    shift: 'morning', skill: 1.02,
    titular: { este: [2, 4, 6] },
    license_number: 'SIM-LC-0002',
    license_expiry: 'TO_PLUS_20_DAYS',        // vence en 20 días → dispara license_expiring
    vacation: ['2026-05-18', '2026-05-31']
  },
  {
    key: 'bustos', name: 'Diego Bustos', email: 'dbustos' + SIM_EMAIL_DOMAIN,
    shift: 'night', skill: 1.00,
    titular: { sur_centro: [1, 3, 5] },
    license_number: 'SIM-LC-0003', license_expiry: '2027-09-02',
    vacation: ['2026-09-07', '2026-09-20']
  },
  {
    key: 'luna', name: 'Sergio Luna', email: 'sluna' + SIM_EMAIL_DOMAIN,
    shift: 'night', skill: 1.04,
    titular: { oeste: [2, 4, 7] },
    license_number: 'SIM-LC-0004', license_expiry: '2027-12-19',
    vacation: ['2026-06-22', '2026-07-05']
  },
  {
    key: 'perez', existing: 'perez',          // Juan Pérez (usuario de prueba existente)
    shift: 'night', skill: 0.99,
    titular: { centro: [1, 2, 3, 4] },
    vacation: ['2026-08-10', '2026-08-23']
  },
  {
    key: 'quiroga', name: 'Hernán Quiroga', email: 'hquiroga' + SIM_EMAIL_DOMAIN,
    shift: 'night', skill: 1.01,
    titular: { centro: [5, 7] },
    license_number: 'SIM-LC-0005', license_expiry: '2029-01-30',
    vacation: ['2026-10-05', '2026-10-18']
  },
  {
    key: 'medina', name: 'Walter Medina', email: 'wmedina' + SIM_EMAIL_DOMAIN,
    shift: 'both', skill: 1.00, relief: true,
    titular: {},
    license_number: 'SIM-LC-0006', license_expiry: '2027-06-11',
    vacation: ['2026-04-20', '2026-05-03']
  }
]

// [SUPUESTO] Un conductor que no es titular tarda 8% más (no conoce
// el recorrido de memoria). Probabilidad diaria de ausencia por
// enfermedad/trámite y descanso mínimo entre jornadas (LCT art. 197).
const NON_TITULAR_FACTOR = 1.08
const DAILY_ABSENCE_PROB = 0.012
const MIN_REST_HOURS = 12

// ── Feriados ─────────────────────────────────────────────
// [REAL] Feriados nacionales 2026 (abril–noviembre).
// Fuente: Chequeado, "Feriados 2026" (calendario oficial).
// policy:
//   'no_service' → Cotreco no presta servicio (Día del Trabajador)
//   'reduced'    → se presta con guardia reducida (sale más tarde y
//                  rinde menos)  [SUPUESTO sobre la política de Cotreco]
const HOLIDAYS = {
  '2026-05-01': { name: 'Día del Trabajador', policy: 'no_service' },
  '2026-05-25': { name: 'Revolución de Mayo', policy: 'reduced' },
  '2026-06-15': { name: 'Paso a la Inmortalidad de Güemes (trasladado)', policy: 'reduced' },
  '2026-06-20': { name: 'Paso a la Inmortalidad de Belgrano', policy: 'reduced' },
  '2026-07-09': { name: 'Día de la Independencia', policy: 'reduced' },
  '2026-07-10': { name: 'Día no laborable con fines turísticos', policy: 'reduced' },
  '2026-08-17': { name: 'Paso a la Inmortalidad de San Martín', policy: 'reduced' },
  '2026-10-12': { name: 'Día del Respeto a la Diversidad Cultural', policy: 'reduced' },
  '2026-11-23': { name: 'Día de la Soberanía Nacional', policy: 'reduced' }
}

// ── Medidas gremiales ────────────────────────────────────
// [SIMULADO] Fechas inventadas para ejercitar el sistema.
//   strike   → paro total: se cancelan todos los recorridos del día
//   assembly → asamblea: los camiones salen 3 horas tarde
const LABOR_EVENTS = {
  '2026-06-11': { type: 'strike',   label: 'Paro gremial (evento simulado)' },
  '2026-09-09': { type: 'assembly', label: 'Asamblea gremial al inicio del turno (evento simulado)', delayMin: 180 }
}

// ── Obras en la vía pública ──────────────────────────────
// [SIMULADO] Una obra de repavimentación en Centro Sur corta calles
// durante casi dos meses: genera una zona problemática recurrente y
// acotada en el tiempo (la IA debería detectarla y verla desaparecer).
const ROADWORKS = [
  {
    zone: 'CENTRO SUR', from: '2026-08-03', to: '2026-09-25',
    prob: 0.45, label: 'Calle cortada por obra de repavimentación (evento simulado)'
  }
]

// ── Flota ────────────────────────────────────────────────
// [SUPUESTO] La probabilidad de rotura crece con el desgaste y baja
// después de un mantenimiento integral. [SIMULADO] fecha del service.
const FLEET = {
  baseBreakdownProb: 0.012,       // por salida, con la flota recién revisada
  wearPerDay: 0.00030,            // aumento diario por desgaste
  maintenanceDates: ['2026-09-01'],
  reinforcementProb: 0.65,        // con unidad de refuerzo se termina el recorrido
  reinforcementDelayMin: [60, 150],
  preStartShare: 0.25             // parte de las roturas que ocurre antes de salir
}

// ── Clima ────────────────────────────────────────────────
// [SUPUESTO] Climatología aproximada de Villa María (estación seca en
// invierno, lluvias que vuelven en primavera). Fracción de días con
// lluvia por mes y fracción de esos días que son tormenta fuerte.
// Se genera con una cadena de Markov: si llovió ayer, es más probable
// que llueva hoy (las lluvias vienen en rachas).
const CLIMATE = {
  rainyDayShare: { 4: 0.17, 5: 0.10, 6: 0.07, 7: 0.06, 8: 0.07, 9: 0.12, 10: 0.22, 11: 0.27 },
  heavyShare:    { 4: 0.35, 5: 0.30, 6: 0.25, 7: 0.25, 8: 0.25, 9: 0.35, 10: 0.45, 11: 0.50 },
  persistence: 0.45,              // P(lluvia hoy | llovió ayer)
  windyStormProb: 0.5             // tormenta fuerte con viento (tira ramas)
}

// ── Generación de residuos ───────────────────────────────
// [SUPUESTO] Multiplicadores de cuánta basura se genera por día.
// La carga de cada salida es lo acumulado desde la última recolección
// efectiva del barrio, así que los lunes, los días posteriores a un
// feriado sin servicio o a un paro, y los barrios que quedaron sin
// recolectar, llegan con más volumen de forma natural.
const WASTE = {
  monthFactor: { 4: 1.00, 5: 0.97, 6: 0.95, 7: 1.03, 8: 0.96, 9: 1.00, 10: 1.03, 11: 1.06 },
  weekendFactor: 1.08,            // sábados y domingos se genera más en los hogares
  holidayFactor: 1.10,
  maxLoad: 3.0,                   // tope de acumulación considerado
  // El tiempo no crece en proporción directa al volumen: con el doble
  // de basura las paradas son las mismas, solo hay más bolsas por parada
  loadElasticity: 0.75
}

// ── Tiempos operativos ───────────────────────────────────
// [SUPUESTO] Estructura de tiempo de una salida:
//   salida de base + (barrio → traslado → barrio …) + descarga
const TIMING = {
  baseExitMin: 15,                // base → primer barrio
  transitMin: [6, 11],            // traslado entre barrios
  dumpMin: [35, 45],              // ida al punto de descarga, descarga y vuelta
  extraDumpLoad: 1.30,            // si la carga total supera esto, hace una 2da descarga
  fixedShare: 0.40,               // parte del tiempo que no depende del volumen (recorrer calles)
  shiftLimitMin: 540,             // 8 h de turno + 1 h extra: después se dejan barrios pendientes
  startDelay: { mean: 8, sd: 6 },
  timeNoise: 0.08,                // ruido log-normal sobre cada barrio
  collectionSpeedKmh: 7.5         // velocidad de barrido para el rastro GPS
}

// Densidad: el centro tiene más viviendas y comercios por cuadra
const DENSITY = { centro: 1.6, default: 1.0 }

// ── Efectos ambientales y operativos ─────────────────────
const EFFECTS = {
  // [SUPUESTO] invierno (junio–agosto): de noche cuesta más salir y se rinde menos
  winterMonths: [6, 7, 8],
  winterNightDelayMin: [10, 35],
  winterNightFactor: 1.05,
  winterFogMorningProb: 0.30,
  winterFogDelayMin: [0, 20],

  holidayDelayMin: [10, 25],
  holidayFactor: 1.08,

  lightRainFactor: 1.08,
  heavyRainFactor: 1.22,

  // [SUPUESTO] barrios periféricos con calles de tierra: con tormenta
  // fuerte el camión no puede entrar; el día siguiente siguen con barro
  peripheryKm: 2.0,                // distancia al centro a partir de la cual se considera periferia
  riverside: ['BARRANCAS DEL RIO', 'LAS PLAYAS', 'VILLA DEL SUR', 'VILLA ALBERTINA'],
  heavyRainSkipProb: 0.35,
  riversideHeavyRainSkipProb: 0.55,
  dayAfterHeavyRainSkipProb: 0.12,

  // [SUPUESTO] autos mal estacionados en calles angostas del centro;
  // los viernes a la noche hay más movimiento (bares, salidas)
  centroBlockedProb: 0.05,
  fridayNightMultiplier: 2.5,
  narrowStreetZones: ['GENERAL PAZ', 'ROQUE SAENZ PENA', 'SAN MARTIN', 'ALMIRANTE BROWN'],
  narrowStreetProb: 0.02,
  blockedDelayMin: [10, 30],
  blockedSkipShare: 0.25,          // a veces directamente no se puede pasar

  // [SUPUESTO] residuos que no corresponden a la recolección domiciliaria
  // (escombros, ramas, voluminosos): más en temporada de poda y después
  // de tormentas con viento
  improperWasteProb: 0.008,
  pruningSeason: ['06-15', '08-31'],
  pruningProb: 0.035,
  afterWindstormProb: 0.08,
  improperDelayMin: [5, 15],

  // [SUPUESTO] vecinos que no sacan los residuos
  noWasteProb: 0.004,

  // GPS: sin señal en la periferia (puntos que se suben después)
  offlineZoneProb: 0.15,
  manualVisitProb: 0.05
}

// [SUPUESTO] Puntos de referencia aproximados (no son ubicaciones
// confirmadas: solo sirven para que el rastro GPS salga y vuelva)
const PLACES = {
  cityCenter: { lat: -32.4105, lng: -63.2435 },
  base:       { lat: -32.4240, lng: -63.2050 },
  disposal:   { lat: -32.4480, lng: -63.1820 }
}

// ── Estado de los incidentes ─────────────────────────────
// Los viejos están resueltos; los de los últimos días quedan abiertos
// o en revisión, para que el panel municipal tenga trabajo pendiente.
const INCIDENT_AGING = {
  recentDays: 4,
  mediumDays: 10,
  recent: { open: 0.5, reviewing: 0.3 },   // el resto, resolved
  medium: { open: 0.1, reviewing: 0.2 }
}

// Cantidad de días finales con rastro GPS completo (1 punto por minuto)
const GPS_DAYS = 7

module.exports = {
  SIM_TAG,
  SIM_EMAIL_DOMAIN,
  SIM_CONDUCTOR_PASSWORD,
  EXISTING_USERS,
  ROUTES,
  CONDUCTORS,
  NON_TITULAR_FACTOR,
  DAILY_ABSENCE_PROB,
  MIN_REST_HOURS,
  HOLIDAYS,
  LABOR_EVENTS,
  ROADWORKS,
  FLEET,
  CLIMATE,
  WASTE,
  TIMING,
  DENSITY,
  EFFECTS,
  PLACES,
  INCIDENT_AGING,
  GPS_DAYS
}
