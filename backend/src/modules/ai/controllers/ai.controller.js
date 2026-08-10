'use strict'

const aiService = require('../services/ai.service')
const { ok }    = require('../../../shared/utils/responses')

// POST /api/v1/ai/optimize/:routeId
const optimize = async (req, res) => {
  const suggestion = await aiService.optimizeRoute(
    req.params.routeId,
    req.user.id
  )
  return ok(res, { suggestion }, 'Análisis de optimización generado', 201)
}

// POST /api/v1/ai/predict/:zoneId
const predict = async (req, res) => {
  const suggestion = await aiService.predictDemand(
    req.params.zoneId,
    req.user.id
  )
  return ok(res, { suggestion }, 'Análisis de predicción generado', 201)
}

// GET /api/v1/ai/suggestions
const getSuggestions = async (req, res) => {
  const filters = {
    type:                req.query.type                || undefined,
    status:              req.query.status              || undefined,
    collection_route_id: req.query.route_id            || undefined,
    zone_id:             req.query.zone_id             || undefined
  }
  const suggestions = await aiService.getSuggestions(filters)
  return ok(res, { suggestions, total: suggestions.length })
}

// GET /api/v1/ai/suggestions/:id
const getSuggestionById = async (req, res) => {
  const suggestion = await aiService.getSuggestionById(req.params.id)
  if (!suggestion) {
    return ok(res, null, 'Sugerencia no encontrada')
  }
  return ok(res, { suggestion })
}

// PATCH /api/v1/ai/suggestions/:id/review
const review = async (req, res) => {
  const suggestion = await aiService.reviewSuggestion(
    req.params.id,
    req.body,
    req.user
  )
  return ok(res, { suggestion },
    req.body.status === 'approved'
      ? 'Sugerencia aprobada correctamente'
      : 'Sugerencia rechazada'
  )
}

module.exports = { optimize, predict, getSuggestions, getSuggestionById, review }