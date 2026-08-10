'use strict'

const settingsService = require('../services/settings.service')
const auditService    = require('../../audit/services/audit.service')
const { ok }          = require('../../../shared/utils/responses')

// GET /api/v1/settings
const getAll = async (req, res) => {
  const settings = await settingsService.getAll()
  return ok(res, { settings, total: settings.length })
}

// PATCH /api/v1/settings/:key
const update = async (req, res) => {
  const { key } = req.params
  const { value } = req.body

  if (value === undefined || value === null || value === '') {
    return ok(res, null, 'El valor es requerido', 400)
  }

  // Guardar valor anterior para auditoría
  const before = await settingsService.getAll()
  const oldSetting = before.find(s => s.key === key)

  const updated = await settingsService.set(key, value, req.user.id)

  // Registrar en audit — cambio de configuración del sistema
  await auditService.record({
    requestingUser: req.user,
    action:         auditService.ACTIONS.SETTINGS_CHANGED,
    entity:         auditService.ENTITIES.SETTINGS,
    entity_id:      null,
    old_values:     oldSetting ? { key, value: oldSetting.value } : null,
    new_values:     { key, value },
    ip_address:     auditService.fromRequest(req).ip_address,
    user_agent:     auditService.fromRequest(req).user_agent
  })

  return ok(res, { setting: updated }, `Parámetro '${key}' actualizado correctamente`)
}

module.exports = { getAll, update }