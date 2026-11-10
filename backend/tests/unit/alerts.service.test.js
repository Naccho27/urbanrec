'use strict'

// Tests de las alertas automáticas: que avisen a quien corresponde y
// una sola vez por situación, aunque la revisión corra cada minuto.

const { describe, test, mock, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { pool, load } = require('../helpers/setup')

const settings      = load('modules/settings/services/settings.service')
const notifService  = load('modules/notifications/services/notifications.service')
const alertsService = load('modules/notifications/services/alerts.service')

afterEach(() => mock.restoreAll())

// Base de datos falsa que responde según la consulta
const fakeDb = ({ rows, alreadyNotified }) =>
  mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM notifications')) return [alreadyNotified ? [{ 1: 1 }] : []]
    if (sql.includes('FROM users')) return [[{ id: 6 }, { id: 7 }]]   // municipal + operador
    return [rows]
  })

describe('checkDelayed: recorridos que superan la duración máxima', () => {
  const delayed = [{ id: 100, company_id: 1, route_name: 'Recorrido Centro', elapsed_min: 545 }]

  test('avisa al municipio y a la empresa', async () => {
    mock.method(settings, 'get', async () => 480)
    fakeDb({ rows: delayed, alreadyNotified: false })
    const notify = mock.method(notifService, 'notifyRouteDelayed', async () => {})

    const count = await alertsService.checkDelayed()

    assert.equal(count, 1)
    assert.deepEqual(notify.mock.calls.map(c => c.arguments[0]), [6, 7])
    assert.equal(notify.mock.calls[0].arguments[1].executionId, 100)
  })

  test('no repite el aviso si ya se mandó', async () => {
    mock.method(settings, 'get', async () => 480)
    fakeDb({ rows: delayed, alreadyNotified: true })
    const notify = mock.method(notifService, 'notifyRouteDelayed', async () => {})

    assert.equal(await alertsService.checkDelayed(), 0)
    assert.equal(notify.mock.callCount(), 0)
  })

  test('usa el umbral configurado en system_settings', async () => {
    mock.method(settings, 'get', async () => 300)
    const exec = fakeDb({ rows: [], alreadyNotified: false })
    await alertsService.checkDelayed()
    assert.deepEqual(exec.mock.calls[0].arguments[1], [300])
  })

  test('si el parámetro no existe usa 480 minutos', async () => {
    mock.method(settings, 'get', async () => null)
    const exec = fakeDb({ rows: [], alreadyNotified: false })
    await alertsService.checkDelayed()
    assert.deepEqual(exec.mock.calls[0].arguments[1], [480])
  })
})

describe('checkNotStarted: recorridos sin iniciar', () => {
  test('también avisa al conductor asignado', async () => {
    mock.method(settings, 'get', async () => 30)
    fakeDb({ rows: [{ id: 101, company_id: 1, conductor_id: 8, route_name: 'Recorrido Este', late_min: 45 }], alreadyNotified: false })
    const notify = mock.method(notifService, 'notifyRouteNotStarted', async () => {})

    await alertsService.checkNotStarted()
    assert.deepEqual(notify.mock.calls.map(c => c.arguments[0]), [6, 7, 8])
  })
})
