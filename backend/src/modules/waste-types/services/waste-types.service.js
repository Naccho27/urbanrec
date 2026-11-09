'use strict'

const wasteTypeModel = require('../models/waste-type.model')
const cache          = require('../../../shared/services/cache.service')
const auditService   = require('../../audit/services/audit.service')

// TTL de tipos de residuo: 2 horas
// Casi nunca cambian — son 4 tipos fijos que el municipio definió
const WASTE_TYPES_TTL = 7200

const getAll = async (filters) => {
  // Clave de caché según los filtros aplicados
  const cacheKey = filters.is_active !== undefined
    ? `${cache.KEYS.WASTE_TYPES}:active:${filters.is_active}`
    : `${cache.KEYS.WASTE_TYPES}:all`

  // remember: si está en caché lo devuelve, si no ejecuta la query y cachea
  return cache.remember(cacheKey, WASTE_TYPES_TTL, async () => {
    return wasteTypeModel.findAll(filters)
  })
}

const getById = async (id) => {
  const cacheKey = `${cache.KEYS.WASTE_TYPES}:${id}`

  const wt = await cache.remember(cacheKey, WASTE_TYPES_TTL, async () => {
    return wasteTypeModel.findById(id)
  })

  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }
  return wt
}

const create = async (data, requestingUser) => {
  // Verificar nombre duplicado
  const existing = await wasteTypeModel.findByName(data.name)
  if (existing) {
    const err = new Error('Ya existe un tipo de residuo con ese nombre')
    err.statusCode = 409
    throw err
  }
  const id = await wasteTypeModel.create(data)

  // Invalidar caché — hay un tipo nuevo que debe aparecer en los listados
  await cache.invalidatePattern(`${cache.KEYS.WASTE_TYPES}:*`)

  await auditService.record({
    requestingUser,
    action:     auditService.ACTIONS.CREATE,
    entity:     auditService.ENTITIES.WASTE_TYPE,
    entity_id:  id,
    new_values: data
  })

  return wasteTypeModel.findById(id)
}

const update = async (id, data, requestingUser) => {
  const wt = await wasteTypeModel.findById(id)
  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }

  // Verificar nombre duplicado si se está cambiando
  if (data.name && data.name !== wt.name) {
    const existing = await wasteTypeModel.findByName(data.name)
    if (existing) {
      const err = new Error('Ya existe un tipo de residuo con ese nombre')
      err.statusCode = 409
      throw err
    }
  }

  await wasteTypeModel.update(id, data)

  // Invalidar caché — el tipo cambió y los listados deben reflejarlo
  await cache.invalidatePattern(`${cache.KEYS.WASTE_TYPES}:*`)

  await auditService.record({
    requestingUser,
    action:     auditService.ACTIONS.UPDATE,
    entity:     auditService.ENTITIES.WASTE_TYPE,
    entity_id:  parseInt(id),
    old_values: Object.fromEntries(Object.keys(data).map(k => [k, wt[k]])),
    new_values: data
  })

  return wasteTypeModel.findById(id)
}

const remove = async (id, requestingUser) => {
  const wt = await wasteTypeModel.findById(id)
  if (!wt) {
    const err = new Error('Tipo de residuo no encontrado')
    err.statusCode = 404
    throw err
  }
  await wasteTypeModel.remove(id)

  // Invalidar caché — el tipo desactivado no debe aparecer en listados activos
  await cache.invalidatePattern(`${cache.KEYS.WASTE_TYPES}:*`)

  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.SOFT_DELETE,
    entity:    auditService.ENTITIES.WASTE_TYPE,
    entity_id: parseInt(id)
  })

  return { message: 'Tipo de residuo desactivado correctamente' }
}

module.exports = { getAll, getById, create, update, remove }