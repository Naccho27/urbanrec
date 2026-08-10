'use strict'

const trackingService  = require('../services/tracking.service')
const syncQueueService = require('../services/sync-queue.service')
const trackingModel    = require('../models/tracking.model')
const { ok }           = require('../../../shared/utils/responses')

// ── Ejecuciones ───────────────────────────────────────────

const getExecutions = async (req, res) => {
  const filters = {
    company_id:   req.query.company_id   || undefined,
    conductor_id: req.query.conductor_id || undefined,
    status:       req.query.status       || undefined,
    date:         req.query.date         || undefined
  }
  const executions = await trackingModel.findExecutions(filters)
  return ok(res, { executions, total: executions.length })
}

const getExecutionById = async (req, res) => {
  const execution = await trackingModel.findExecutionById(req.params.id)
  if (!execution) {
    return ok(res, null, 'Ejecución no encontrada')
  }
  return ok(res, { execution })
}

// Ejecuciones activas en este momento — para el mapa en tiempo real
const getActiveExecutions = async (req, res) => {
  const company_id = req.user.company_id || null
  const executions = await trackingModel.findActiveExecutions(company_id)
  return ok(res, { executions, total: executions.length })
}

const createExecution = async (req, res) => {
  const execution = await trackingService.createExecution(req.body, req.user)
  return ok(res, { execution }, 'Ejecución creada correctamente', 201)
}

const startExecution = async (req, res) => {
  const execution = await trackingService.startExecution(
    req.params.id,
    req.user.id
  )
  return ok(res, { execution }, 'Recorrido iniciado')
}

const pauseExecution = async (req, res) => {
  const execution = await trackingService.pauseExecution(
    req.params.id,
    req.user.id
  )
  return ok(res, { execution }, 'Recorrido pausado')
}

const completeExecution = async (req, res) => {
  const execution = await trackingService.completeExecution(
    req.params.id,
    req.user.id,
    req.body.notes
  )
  return ok(res, { execution }, 'Recorrido finalizado')
}

// ── GPS ───────────────────────────────────────────────────

const recordGps = async (req, res) => {
  const result = await trackingService.recordGpsPoint(req.body, req.user.id)
  return ok(res, result)
}

const getGpsHistory = async (req, res) => {
  const points = await trackingModel.getGpsHistory(req.params.id)
  return ok(res, { points, total: points.length })
}

// ── Zone Visits ───────────────────────────────────────────

const getZoneVisits = async (req, res) => {
  const visits = await trackingModel.findZoneVisits(req.params.id)
  return ok(res, { visits, total: visits.length })
}

const confirmZone = async (req, res) => {
  const { zone_id, notes } = req.body
  const visits = await trackingService.confirmZoneManually(
    req.params.id,
    zone_id,
    req.user.id,
    notes
  )
  return ok(res, { visits }, 'Zona confirmada manualmente')
}

// ── Sync Queue ────────────────────────────────────────────

const syncOfflineData = async (req, res) => {
  const results = await syncQueueService.processSyncQueue(req.body, req.user.id)
  return ok(res, results, 'Sincronización completada')
}

module.exports = {
  getExecutions,
  getExecutionById,
  getActiveExecutions,
  createExecution,
  startExecution,
  pauseExecution,
  completeExecution,
  recordGps,
  getGpsHistory,
  getZoneVisits,
  confirmZone,
  syncOfflineData
}