'use strict'

const { Router } = require('express')
const router     = Router()

router.use('/auth',              require('../modules/auth/routes/auth.routes'))
router.use('/users',             require('../modules/users/routes/users.routes'))
router.use('/companies',         require('../modules/users/routes/company.routes'))
router.use('/waste-types',       require('../modules/waste-types/routes/waste-types.routes'))
router.use('/zones',             require('../modules/zones/routes/zones.routes'))
router.use('/collection-routes', require('../modules/collection-routes/routes/collection-routes.routes'))
router.use('/schedules',         require('../modules/schedules/routes/schedules.routes'))
router.use('/notifications',     require('../modules/notifications/routes/notifications.routes'))
router.use('/tracking',          require('../modules/tracking/routes/tracking.routes'))
router.use('/incidents',         require('../modules/incidents/routes/incidents.routes'))
router.use('/analytics',         require('../modules/analytics/routes/analytics.routes'))
router.use('/audit',             require('../modules/audit/routes/audit.routes'))
router.use('/settings',          require('../modules/settings/routes/settings.routes'))
router.use('/ai',                require('../modules/ai/routes/ai.routes'))
router.use('/export',            require('../modules/analytics/routes/export.routes'))

// ── Rutas públicas ────────────────────────────────────────
router.use('/public/alerts',     require('./public/alerts.routes'))

module.exports = router