'use strict'

const zoneModel      = require('../models/zone.model')
const wasteTypeModel = require('../../waste-types/models/waste-type.model')
const cache          = require('../../../shared/services/cache.service')
const { calculateCentroid, geocodeAddress } = require('../../../shared/utils/geo')
const { ROLES } = require('../../../shared/utils/roles')
const auditService = require('../../audit/services/audit.service')

// TTL de zonas: 1 hora
// Las zonas cambian muy poco — el municipio las define y rara vez las modifica
const ZONES_TTL = 3600

const getAll = async (filters) => {
  // Clave de caché según los filtros aplicados
  const cacheKey = filters.is_active !== undefined
    ? `${cache.KEYS.ZONES}:active:${filters.is_active}`
    : `${cache.KEYS.ZONES}:all`

  // remember: si está en caché lo devuelve, si no ejecuta la query y cachea
  return cache.remember(cacheKey, ZONES_TTL, async () => {
    return zoneModel.findAll(filters)
  })
}

const getById = async (id) => {
  const cacheKey = `${cache.KEYS.ZONE}:${id}`

  const zone = await cache.remember(cacheKey, ZONES_TTL, async () => {
    return zoneModel.findById(id)
  })

  if (!zone) {
    const err = new Error('Zona no encontrada')
    err.statusCode = 404
    throw err
  }
  return zone
}

// Busca zonas cercanas a una dirección
// Usado por ciudadanos para saber qué zona les corresponde
// No se cachea porque cada dirección buscada es distinta
const findByAddress = async (address) => {
  const coords = await geocodeAddress(address)
  if (!coords) {
    const err = new Error('No se encontró la dirección. Intente con otra búsqueda')
    err.statusCode = 404
    throw err
  }

  const zones = await zoneModel.findByCoords(coords.lat, coords.lng)
  return { coords, zones }
}

const create = async (data, requestingUser) => {
  // Solo admin y municipal pueden crear zonas
  if (![ROLES.ADMIN, ROLES.MUNICIPAL].includes(requestingUser.role)) {
    const err = new Error('No tiene permisos para crear zonas')
    err.statusCode = 403
    throw err
  }

  // Calcular centroide automáticamente si no viene en el body
  let { center_lat, center_lng } = data
  if (!center_lat || !center_lng) {
    const centroid = calculateCentroid(data.geojson)
    center_lat = centroid.lat
    center_lng = centroid.lng
  }

  const zoneId = await zoneModel.create({
    name:        data.name,
    description: data.description,
    geojson:     data.geojson,
    center_lat,
    center_lng,
    created_by:  requestingUser.id
  })

  // Si vienen waste_type_ids los asociamos
  if (data.waste_type_ids && data.waste_type_ids.length > 0) {
    // Verificar que todos los tipos existen
    for (const wtId of data.waste_type_ids) {
      const wt = await wasteTypeModel.findById(wtId)
      if (!wt || !wt.is_active) {
        const err = new Error(`Tipo de residuo con ID ${wtId} no existe o está inactivo`)
        err.statusCode = 400
        throw err
      }
    }
    await zoneModel.setWasteTypes(zoneId, data.waste_type_ids)
  }

  // Invalidar caché de zonas — hay una zona nueva que debe aparecer en los listados
  await cache.invalidatePattern(`${cache.KEYS.ZONES}:*`)

  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.CREATE,
    entity:    auditService.ENTITIES.ZONE,
    entity_id: zoneId,
    new_values: { name: data.name, waste_type_ids: data.waste_type_ids }
  })

  return zoneModel.findById(zoneId)
}

const update = async (id, data, requestingUser) => {
  const zone = await zoneModel.findById(id)
  if (!zone) {
    const err = new Error('Zona no encontrada')
    err.statusCode = 404
    throw err
  }

  // Si se actualiza el GeoJSON, recalcular el centroide
  if (data.geojson && !data.center_lat) {
    const centroid = calculateCentroid(data.geojson)
    data.center_lat = centroid.lat
    data.center_lng = centroid.lng
  }

  await zoneModel.update(id, data)

  // Actualizar tipos de residuo si vienen
  if (data.waste_type_ids !== undefined) {
    await zoneModel.setWasteTypes(id, data.waste_type_ids)
  }

  // Invalidar caché — la zona cambió y el listado debe reflejarlo
  await cache.invalidatePattern(`${cache.KEYS.ZONES}:*`)
  await cache.del(`${cache.KEYS.ZONE}:${id}`)

  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.UPDATE,
    entity:    auditService.ENTITIES.ZONE,
    entity_id: parseInt(id),
    new_values: data
  })

  return zoneModel.findById(id)
}

const remove = async (id) => {
  const zone = await zoneModel.findById(id)
  if (!zone) {
    const err = new Error('Zona no encontrada')
    err.statusCode = 404
    throw err
  }
  await zoneModel.remove(id)

  // Invalidar caché — la zona desactivada no debe aparecer en listados activos
  await cache.invalidatePattern(`${cache.KEYS.ZONES}:*`)
  await cache.del(`${cache.KEYS.ZONE}:${id}`)

  await auditService.record({
    requestingUser,
    action:    auditService.ACTIONS.SOFT_DELETE,
    entity:    auditService.ENTITIES.ZONE,
    entity_id: parseInt(id)
  })

  return { message: 'Zona desactivada correctamente' }
}

module.exports = { getAll, getById, findByAddress, create, update, remove }