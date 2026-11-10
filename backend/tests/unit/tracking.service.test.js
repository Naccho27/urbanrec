'use strict'

// Tests del control de acceso en tracking: IDOR entre empresas,
// asignación de conductores y confirmación manual de barrios.

const { describe, test, mock, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('../helpers/setup')

const trackingModel   = load('modules/tracking/models/tracking.model')
const scheduleModel   = load('modules/schedules/models/schedule.model')
const routeModel      = load('modules/collection-routes/models/collection-route.model')
const userModel       = load('modules/users/models/user.model')
const auditService    = load('modules/audit/services/audit.service')
const trackingService = load('modules/tracking/services/tracking.service')

const ADMIN     = { id: 1, role: 'admin',            company_id: null }
const MUNICIPAL = { id: 6, role: 'municipal',        company_id: null }
const OPERATOR  = { id: 7, role: 'operator_company', company_id: 1 }
const OTHER_OP  = { id: 9, role: 'operator_company', company_id: 2 }
const CONDUCTOR = { id: 8, role: 'conductor',        company_id: 1 }
const OTHER_CON = { id: 15, role: 'conductor',       company_id: 1 }

const EXECUTION = { id: 100, company_id: 1, conductor_id: 8, collection_route_id: 5, status: 'in_progress', zones_total: 4 }

// Afirma que la promesa falla con el código HTTP esperado
const rejectsWith = (promise, statusCode) =>
  assert.rejects(promise, (err) => err.statusCode === statusCode)

afterEach(() => mock.restoreAll())

describe('getExecutionById: acceso por rol (corrección de IDOR)', () => {
  const withExecution = () =>
    mock.method(trackingModel, 'findExecutionById', async () => ({ ...EXECUTION }))

  test('admin y municipal ven cualquier ejecución', async () => {
    withExecution()
    assert.equal((await trackingService.getExecutionById(100, ADMIN)).id, 100)
    assert.equal((await trackingService.getExecutionById(100, MUNICIPAL)).id, 100)
  })

  test('el operador ve las de su empresa', async () => {
    withExecution()
    assert.equal((await trackingService.getExecutionById(100, OPERATOR)).id, 100)
  })

  test('el operador de otra empresa recibe 403', async () => {
    withExecution()
    await rejectsWith(trackingService.getExecutionById(100, OTHER_OP), 403)
  })

  test('el conductor ve solo la propia', async () => {
    withExecution()
    assert.equal((await trackingService.getExecutionById(100, CONDUCTOR)).id, 100)
    await rejectsWith(trackingService.getExecutionById(100, OTHER_CON), 403)
  })

  test('una ejecución inexistente da 404 y no 403', async () => {
    mock.method(trackingModel, 'findExecutionById', async () => null)
    await rejectsWith(trackingService.getExecutionById(999, ADMIN), 404)
  })
})

describe('createExecution: asignación de conductor', () => {
  const setup = (conductor) => {
    mock.method(scheduleModel, 'findById', async () => ({ id: 3, company_id: 1, collection_route_id: 5 }))
    mock.method(routeModel, 'getZones', async () => [{ id: 1 }, { id: 2 }, { id: 3 }])
    mock.method(userModel, 'findById', async () => conductor)
    const create = mock.method(trackingModel, 'createExecution', async () => 100)
    mock.method(trackingModel, 'findExecutionById', async () => ({ ...EXECUTION }))
    const audit = mock.method(auditService, 'record', async () => {})
    return { create, audit }
  }

  test('rechaza un conductor de otra empresa', async () => {
    const { create } = setup({ id: 20, role: 'conductor', company_id: 2, is_active: true })
    await rejectsWith(trackingService.createExecution({ schedule_id: 3, conductor_id: 20 }, OPERATOR), 400)
    assert.equal(create.mock.callCount(), 0)
  })

  test('rechaza un usuario que no es conductor', async () => {
    setup({ id: 6, role: 'municipal', company_id: null, is_active: true })
    await rejectsWith(trackingService.createExecution({ schedule_id: 3, conductor_id: 6 }, OPERATOR), 400)
  })

  test('rechaza un conductor inactivo', async () => {
    setup({ id: 8, role: 'conductor', company_id: 1, is_active: false })
    await rejectsWith(trackingService.createExecution({ schedule_id: 3, conductor_id: 8 }, OPERATOR), 400)
  })

  test('asigna un conductor válido, calcula zones_total y lo audita', async () => {
    const { create, audit } = setup({ id: 8, role: 'conductor', company_id: 1, is_active: true })
    await trackingService.createExecution({ schedule_id: 3, conductor_id: 8, execution_date: '2026-11-12' }, OPERATOR)

    assert.equal(create.mock.calls[0].arguments[0].zones_total, 3)
    const entry = audit.mock.calls[0].arguments[0]
    assert.equal(entry.action, 'CREATE')
    assert.equal(entry.entity, 'route_execution')
    assert.equal(entry.new_values.conductor_id, 8)
  })

  test('un operador no puede usar un cronograma de otra empresa', async () => {
    setup({ id: 8, role: 'conductor', company_id: 1, is_active: true })
    await rejectsWith(trackingService.createExecution({ schedule_id: 3, conductor_id: 8 }, OTHER_OP), 403)
  })
})

describe('confirmZoneManually: confirmación manual de barrios', () => {
  const setup = (execution) => {
    mock.method(trackingModel, 'findExecutionById', async () => execution)
    mock.method(routeModel, 'getZones', async () => [{ id: 10 }, { id: 11 }])
    mock.method(trackingModel, 'zoneAlreadyVisited', async () => false)
    const save = mock.method(trackingModel, 'saveZoneVisit', async () => {})
    mock.method(trackingModel, 'findZoneVisits', async () => [{ zone_id: 10 }])
    mock.method(trackingModel, 'updateExecutionStatus', async () => {})
    const audit = mock.method(auditService, 'record', async () => {})
    return { save, audit }
  }

  test('rechaza un barrio que no es del recorrido', async () => {
    const { save } = setup({ ...EXECUTION })
    await rejectsWith(trackingService.confirmZoneManually(100, 99, 8), 400)
    assert.equal(save.mock.callCount(), 0)
  })

  test('rechaza confirmar en un recorrido ya cerrado', async () => {
    setup({ ...EXECUTION, status: 'completed' })
    await rejectsWith(trackingService.confirmZoneManually(100, 10, 8), 400)
  })

  test('rechaza a un conductor que no es el asignado', async () => {
    setup({ ...EXECUTION })
    await rejectsWith(trackingService.confirmZoneManually(100, 10, 15), 403)
  })

  test('confirma un barrio válido y queda auditado', async () => {
    const { save, audit } = setup({ ...EXECUTION })
    await trackingService.confirmZoneManually(100, 10, 8, 'sin señal')
    assert.equal(save.mock.calls[0].arguments[0].method, 'manual')
    assert.equal(audit.mock.calls[0].arguments[0].new_values.zone_id, 10)
  })
})
