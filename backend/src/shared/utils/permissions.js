'use strict'

const { ROLES } = require('./roles')

// Permisos granulares del sistema (RBAC+).
// Cada permiso representa una acción específica.
// ROLE_PERMISSIONS mapea qué permisos tiene cada rol.
//
// Permite evolucionar de checkRole() a checkPermission()
// sin cambiar los módulos de negocio.

const PERMISSIONS = Object.freeze({
  // Zonas
  ZONES_READ:          'zones:read',
  ZONES_WRITE:         'zones:write',
  ZONES_DELETE:        'zones:delete',

  // Recorridos
  ROUTES_READ:         'routes:read',
  ROUTES_WRITE:        'routes:write',
  ROUTES_DELETE:       'routes:delete',
  ROUTES_ASSIGN:       'routes:assign',       // asignar empresa a recorrido

  // Cronogramas
  SCHEDULES_READ:      'schedules:read',
  SCHEDULES_WRITE:     'schedules:write',

  // Tipos de residuo
  WASTE_TYPES_READ:    'waste_types:read',
  WASTE_TYPES_WRITE:   'waste_types:write',

  // Conductores
  CONDUCTORS_READ:     'conductors:read',
  CONDUCTORS_ASSIGN:   'conductors:assign',   // asignar conductor a recorrido

  // Tracking
  TRACKING_READ:       'tracking:read',       // ver mapa en tiempo real
  TRACKING_WRITE:      'tracking:write',      // conductor actualiza posición

  // Incidentes
  INCIDENTS_READ:      'incidents:read',
  INCIDENTS_WRITE:     'incidents:write',
  INCIDENTS_RESOLVE:   'incidents:resolve',   // solo municipal puede resolver

  // Analytics
  ANALYTICS_READ:      'analytics:read',

  // Usuarios
  USERS_READ:          'users:read',
  USERS_WRITE:         'users:write',
  USERS_DELETE:        'users:delete',

  // Empresas
  COMPANIES_READ:      'companies:read',
  COMPANIES_WRITE:     'companies:write',

  // Auditoría
  AUDIT_READ:          'audit:read',

  // Configuración
  SETTINGS_READ:       'settings:read',
  SETTINGS_WRITE:      'settings:write',

  // IA
  AI_READ:             'ai:read',
  AI_APPROVE:          'ai:approve'           // aprobar sugerencias de IA
})

const ROLE_PERMISSIONS = Object.freeze({

  [ROLES.ADMIN]: Object.values(PERMISSIONS),  // acceso total

  [ROLES.MUNICIPAL]: [
    PERMISSIONS.ZONES_READ,
    PERMISSIONS.ZONES_WRITE,
    PERMISSIONS.ZONES_DELETE,
    PERMISSIONS.ROUTES_READ,
    PERMISSIONS.ROUTES_WRITE,
    PERMISSIONS.ROUTES_DELETE,
    PERMISSIONS.ROUTES_ASSIGN,
    PERMISSIONS.SCHEDULES_READ,
    PERMISSIONS.SCHEDULES_WRITE,
    PERMISSIONS.WASTE_TYPES_READ,
    PERMISSIONS.WASTE_TYPES_WRITE,
    PERMISSIONS.CONDUCTORS_READ,
    PERMISSIONS.TRACKING_READ,
    PERMISSIONS.INCIDENTS_READ,
    PERMISSIONS.INCIDENTS_RESOLVE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.AI_READ,
    PERMISSIONS.AI_APPROVE,
    PERMISSIONS.COMPANIES_READ
  ],

  [ROLES.OPERATOR_COMPANY]: [
    PERMISSIONS.ROUTES_READ,
    PERMISSIONS.SCHEDULES_READ,
    PERMISSIONS.CONDUCTORS_READ,
    PERMISSIONS.CONDUCTORS_ASSIGN,
    PERMISSIONS.TRACKING_READ,
    PERMISSIONS.INCIDENTS_READ,
    PERMISSIONS.ANALYTICS_READ
  ],

  [ROLES.CONDUCTOR]: [
    PERMISSIONS.ROUTES_READ,
    PERMISSIONS.TRACKING_READ,
    PERMISSIONS.TRACKING_WRITE,
    PERMISSIONS.INCIDENTS_WRITE
  ],

  [ROLES.CITIZEN]: [
    PERMISSIONS.ZONES_READ,
    PERMISSIONS.ROUTES_READ,
    PERMISSIONS.SCHEDULES_READ,
    PERMISSIONS.TRACKING_READ
  ]
})

module.exports = { PERMISSIONS, ROLE_PERMISSIONS }