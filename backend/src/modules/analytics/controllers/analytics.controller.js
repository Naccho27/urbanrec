'use strict'

const analyticsService = require('../services/analytics.service')
const { ok }           = require('../../../shared/utils/responses')

// Parsea los filtros de fecha y empresa de los query params
const parseFilters = (query) => ({
  from:       query.from       || null,
  to:         query.to         || null,
  company_id: query.company_id
    ? parseInt(query.company_id)
    : null
})

// GET /api/v1/analytics/dashboard
const getDashboard = async (req, res) => {
  const data = await analyticsService.getDashboard(req.user)
  return ok(res, data)
}

// GET /api/v1/analytics/executions
const getExecutionsSummary = async (req, res) => {
  const data = await analyticsService.getExecutionsSummary(
    parseFilters(req.query),
    req.user
  )
  return ok(res, data)
}

// GET /api/v1/analytics/routes
const getRouteMetrics = async (req, res) => {
  const data = await analyticsService.getRouteMetrics(
    parseFilters(req.query),
    req.user
  )
  return ok(res, { routes: data, total: data.length })
}

// GET /api/v1/analytics/incidents
const getIncidentStats = async (req, res) => {
  const data = await analyticsService.getIncidentStats(
    parseFilters(req.query),
    req.user
  )
  return ok(res, data)
}

// GET /api/v1/analytics/coverage
const getZoneCoverage = async (req, res) => {
  const data = await analyticsService.getZoneCoverage(
    parseFilters(req.query),
    req.user
  )
  return ok(res, { zones: data, total: data.length })
}

// GET /api/v1/analytics/conductors
const getConductorMetrics = async (req, res) => {
  const data = await analyticsService.getConductorMetrics(
    parseFilters(req.query),
    req.user
  )
  return ok(res, { conductors: data, total: data.length })
}

module.exports = {
  getDashboard,
  getExecutionsSummary,
  getRouteMetrics,
  getIncidentStats,
  getZoneCoverage,
  getConductorMetrics
}