'use strict'

// Constantes operativas del sistema.
// Estados, tipos y valores fijos que se usan
// en múltiples módulos.

const EXECUTION_STATUS = Object.freeze({
  PENDING:      'pending',
  ASSIGNED:     'assigned',
  IN_PROGRESS:  'in_progress',
  PAUSED:       'paused',
  COMPLETED:    'completed',
  CANCELLED:    'cancelled',
  WITH_ISSUES:  'with_issues'
})

const INCIDENT_TYPES = Object.freeze({
  BLOCKED_STREET:    'blocked_street',
  INACCESSIBLE_ZONE: 'inaccessible_zone',
  NO_WASTE:          'no_waste',
  VEHICLE_ISSUE:     'vehicle_issue',
  WEATHER:           'weather',
  OTHER:             'other'
})

const INCIDENT_STATUS = Object.freeze({
  OPEN:       'open',
  REVIEWING:  'reviewing',
  RESOLVED:   'resolved'
})

const SHIFT = Object.freeze({
  MORNING:   'morning',
  AFTERNOON: 'afternoon',
  NIGHT:     'night'
})

const NOTIFICATION_CHANNELS = Object.freeze({
  IN_APP: 'in_app',
  EMAIL:  'email'
})

const NOTIFICATION_TYPES = Object.freeze({
  ROUTE_COMPLETED:    'route_completed',
  ROUTE_DELAYED:      'route_delayed',
  ROUTE_CANCELLED:    'route_cancelled',
  INCIDENT_REPORTED:  'incident_reported',
  INCIDENT_RESOLVED:  'incident_resolved',
  LICENSE_EXPIRING:   'license_expiring',
  GPS_INACTIVITY:     'gps_inactivity',
  SYNC_PENDING:       'sync_pending',
  SERVICE_ALERT:      'service_alert'    // ← aviso público del municipio a ciudadanos
})

const VISIT_METHOD = Object.freeze({
  AUTO:   'auto',
  MANUAL: 'manual'
})

const AI_SUGGESTION_TYPES = Object.freeze({
  ROUTE_OPTIMIZATION: 'route_optimization',
  DEMAND_PREDICTION:  'demand_prediction'
})

const AI_SUGGESTION_STATUS = Object.freeze({
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
})

module.exports = {
  EXECUTION_STATUS,
  INCIDENT_TYPES,
  INCIDENT_STATUS,
  SHIFT,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  VISIT_METHOD,
  AI_SUGGESTION_TYPES,
  AI_SUGGESTION_STATUS
}