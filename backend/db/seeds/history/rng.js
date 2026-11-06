'use strict'

// ─────────────────────────────────────────────────────────
// Generador de números aleatorios con semilla (reproducible).
//
// Math.random() no acepta semilla: cada corrida daría datos
// distintos y no se podrían repetir los experimentos de la tesis.
// Con una semilla fija, la misma corrida produce exactamente el
// mismo histórico, así cualquiera puede verificar los resultados.
//
// Algoritmo: mulberry32 (generador de 32 bits, rápido y con buena
// distribución para simulación; no es criptográficamente seguro y
// no hace falta que lo sea).
// ─────────────────────────────────────────────────────────

const createRng = (seed) => {
  let state = seed >>> 0

  // Número uniforme en [0, 1)
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Uniforme en [min, max)
  const uniform = (min, max) => min + (max - min) * next()

  // Entero uniforme en [min, max] (ambos incluidos)
  const int = (min, max) => Math.floor(uniform(min, max + 1))

  // true con probabilidad p
  const chance = (p) => next() < p

  // Elemento al azar de un array
  const pick = (arr) => arr[Math.floor(next() * arr.length)]

  // Normal (media, desvío) con Box-Muller
  const normal = (mean = 0, sd = 1) => {
    const u = 1 - next()   // evita log(0)
    const v = next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  // Multiplicador log-normal centrado en 1 (ruido multiplicativo).
  // Útil para tiempos: nunca da negativo y la cola es hacia arriba,
  // como pasa en la realidad (un recorrido se atrasa más de lo que
  // se adelanta).
  const noise = (sigma) => Math.exp(normal(0, sigma) - (sigma * sigma) / 2)

  return { next, uniform, int, chance, pick, normal, noise }
}

module.exports = { createRng }
