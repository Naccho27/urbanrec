'use strict'

// Tests del formato de horarios públicos (GET /public/schedules)

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('../helpers/setup')

const { daysLabel, hhmm, nextCollection } = load('shared/utils/schedule-format')

const LMV_MANANA = { week_days: [1, 3, 5], start_time: '06:00:00', end_time: '14:00:00', shift: 'morning', waste_type: 'Domiciliarios' }
const CENTRO_NOCHE = { week_days: [1, 2, 3, 4, 5, 7], start_time: '22:00:00', end_time: '06:00:00', shift: 'night', waste_type: 'Domiciliarios' }

describe('daysLabel y hhmm', () => {
  test('arma la lista de días en castellano', () => {
    assert.equal(daysLabel([1, 3, 5]), 'Lunes, Miércoles y Viernes')
    assert.equal(daysLabel([2, 4, 7]), 'Martes, Jueves y Domingo')
    assert.equal(daysLabel([6]), 'Sábado')
    assert.equal(daysLabel([]), '')
  })

  test('recorta los segundos', () => {
    assert.equal(hhmm('22:00:00'), '22:00')
  })
})

describe('nextCollection', () => {
  // Lunes 9 de noviembre de 2026
  const lunes = (h, m = 0) => new Date(2026, 10, 9, h, m)

  test('hoy, si todavía no empezó', () => {
    const next = nextCollection([LMV_MANANA], lunes(5, 30))
    assert.equal(next.date, '2026-11-09')
    assert.equal(next.is_today, true)
    assert.equal(next.start_time, '06:00')
  })

  test('si ya empezó hoy, el próximo día de servicio', () => {
    const next = nextCollection([LMV_MANANA], lunes(19, 6))
    assert.equal(next.date, '2026-11-11')
    assert.equal(next.day_name, 'Miércoles')
    assert.equal(next.is_today, false)
  })

  test('turno noche: a las 21:44 todavía es hoy', () => {
    const next = nextCollection([CENTRO_NOCHE], lunes(21, 44))
    assert.equal(next.is_today, true)
    assert.equal(next.shift_name, 'Noche')
  })

  test('cruza la semana (viernes → lunes)', () => {
    const viernes = new Date(2026, 10, 13, 15, 0)
    assert.equal(nextCollection([LMV_MANANA], viernes).date, '2026-11-16')
  })

  test('sin cronogramas devuelve null', () => {
    assert.equal(nextCollection([], lunes(10)), null)
  })
})
