'use strict'

// Tests de las piezas del generador de histórico sintético

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { createRng } = require(path.join(__dirname, '..', '..', 'db', 'seeds', 'history', 'rng'))
const geo = require(path.join(__dirname, '..', '..', 'db', 'seeds', 'history', 'geo'))

describe('rng con semilla', () => {
  test('la misma semilla produce la misma secuencia (datos reproducibles)', () => {
    const a = createRng(2026)
    const b = createRng(2026)
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next())
  })

  test('otra semilla produce otra secuencia', () => {
    assert.notEqual(createRng(2026).next(), createRng(2027).next())
  })

  test('int respeta los límites', () => {
    const rng = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(1, 3)
      assert.ok(n >= 1 && n <= 3)
    }
  })
})

describe('geo', () => {
  // Cuadrado de ~1,1 km de lado cerca de Villa María
  const square = [
    { lat: -32.41, lng: -63.25 }, { lat: -32.41, lng: -63.24 },
    { lat: -32.40, lng: -63.24 }, { lat: -32.40, lng: -63.25 }
  ]

  test('pointInRing distingue adentro y afuera', () => {
    assert.equal(geo.pointInRing({ lat: -32.405, lng: -63.245 }, square), true)
    assert.equal(geo.pointInRing({ lat: -32.42, lng: -63.245 }, square), false)
  })

  test('areaM2 da el área aproximada (≈ 1,04 km²)', () => {
    const area = geo.areaM2(square)
    assert.ok(area > 1.0e6 && area < 1.1e6, `área ${area}`)
  })

  test('distanceKm: un grado de latitud ≈ 111 km', () => {
    const d = geo.distanceKm({ lat: -32, lng: -63 }, { lat: -33, lng: -63 })
    assert.ok(Math.abs(d - 111.2) < 0.5)
  })
})
