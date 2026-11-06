'use strict'

// ─────────────────────────────────────────────────────────
// Utilidades geográficas para la simulación.
// Trabajan con los polígonos GeoJSON reales de los barrios
// (WGS84: [longitud, latitud]).
// ─────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => deg * Math.PI / 180
const toDeg = (rad) => rad * 180 / Math.PI

// Distancia en km entre dos puntos {lat, lng} (fórmula de haversine)
const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)) / 1000
}

// Rumbo en grados (0 = norte, 90 = este) de a hacia b
const bearing = (a, b) => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
            Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Interpolación lineal entre dos puntos (t entre 0 y 1)
const lerp = (a, b, t) => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t
})

// Extrae el anillo exterior del polígono como [{lat, lng}].
// Si es MultiPolygon toma el polígono con más vértices (el principal).
const outerRing = (geojson) => {
  const g = typeof geojson === 'string' ? JSON.parse(geojson) : geojson
  let ring = null
  if (g.type === 'Polygon') {
    ring = g.coordinates[0]
  } else if (g.type === 'MultiPolygon') {
    ring = g.coordinates
      .map(poly => poly[0])
      .sort((a, b) => b.length - a.length)[0]
  }
  if (!ring) return []
  return ring.map(([lng, lat]) => ({ lat, lng }))
}

// ¿El punto está dentro del anillo? (ray casting)
const pointInRing = (p, ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const crosses = (a.lat > p.lat) !== (b.lat > p.lat) &&
      p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng
    if (crosses) inside = !inside
  }
  return inside
}

// Área aproximada en m² (proyección equirectangular local + shoelace).
// Para barrios de pocos km² el error es despreciable.
const areaM2 = (ring) => {
  if (ring.length < 3) return 0
  const lat0 = toRad(ring[0].lat)
  const xy = ring.map(p => ({
    x: toRad(p.lng) * EARTH_RADIUS_M * Math.cos(lat0),
    y: toRad(p.lat) * EARTH_RADIUS_M
  }))
  let sum = 0
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    sum += (xy[j].x + xy[i].x) * (xy[j].y - xy[i].y)
  }
  return Math.abs(sum / 2)
}

// Rectángulo que contiene al polígono
const boundingBox = (ring) => ({
  minLat: Math.min(...ring.map(p => p.lat)),
  maxLat: Math.max(...ring.map(p => p.lat)),
  minLng: Math.min(...ring.map(p => p.lng)),
  maxLng: Math.max(...ring.map(p => p.lng))
})

// Si el punto cae fuera del barrio, lo acerca al centro hasta que
// quede adentro (los barrios no son rectangulares)
const pullInside = (p, ring, center) => {
  let q = p
  for (let i = 0; i < 6 && ring.length >= 3 && !pointInRing(q, ring); i++) {
    q = lerp(q, center, 0.5)
  }
  return q
}

// Desplaza un punto unos metros al azar (error del GPS del celular)
const jitter = (p, meters, rng) => {
  const dLat = rng.normal(0, meters) / 111320
  const dLng = rng.normal(0, meters) / (111320 * Math.cos(toRad(p.lat)))
  return { lat: p.lat + dLat, lng: p.lng + dLng }
}

// Posición del camión dentro de un barrio mientras recolecta.
// Simula un barrido en "zigzag" (como cortar el pasto): recorre
// filas de este a oeste y vuelve, bajando de norte a sur. No es el
// trazado exacto calle por calle, pero produce un rastro GPS que
// cubre todo el barrio a velocidad de recolección.
//   t    → avance dentro del barrio (0 = entra, 1 = sale)
//   rows → cantidad de filas del zigzag
const sweepPosition = (zone, t, rows) => {
  const box = zone.bbox
  const row = Math.min(rows - 1, Math.floor(t * rows))
  const v = t * rows - row
  const x = row % 2 === 0 ? v : 1 - v
  const y = (row + 0.5) / rows
  const raw = {
    lat: box.maxLat - (box.maxLat - box.minLat) * y,
    lng: box.minLng + (box.maxLng - box.minLng) * x
  }
  return pullInside(raw, zone.ring, zone.center)
}

// Ancho del barrio en km (este-oeste), para calcular filas del zigzag
const widthKm = (bbox) => distanceKm(
  { lat: (bbox.minLat + bbox.maxLat) / 2, lng: bbox.minLng },
  { lat: (bbox.minLat + bbox.maxLat) / 2, lng: bbox.maxLng }
)

// Punto al azar dentro del barrio (para ubicar incidentes)
const randomPointIn = (zone, rng) => {
  const box = zone.bbox
  for (let i = 0; i < 20; i++) {
    const p = {
      lat: rng.uniform(box.minLat, box.maxLat),
      lng: rng.uniform(box.minLng, box.maxLng)
    }
    if (zone.ring.length < 3 || pointInRing(p, zone.ring)) return p
  }
  return zone.center
}

module.exports = {
  distanceKm,
  bearing,
  lerp,
  outerRing,
  pointInRing,
  areaM2,
  boundingBox,
  jitter,
  sweepPosition,
  widthKm,
  randomPointIn
}
