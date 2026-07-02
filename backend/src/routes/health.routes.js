const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { getDocumentSchemaStatus } = require('../services/schema.service');

const router = express.Router();

router.get('/', asyncHandler(async (_req, res) => {
    const [databaseResult, schemaStatus, migrationsResult] = await Promise.all([
        pool.query('SELECT NOW() AS database_time'),
        getDocumentSchemaStatus(pool),
        pool.query(`
            SELECT filename, applied_at
            FROM schema_migrations
            ORDER BY applied_at DESC
            LIMIT 1
        `).catch(() => ({ rows: [] }))
    ]);

    res.json({
        status: schemaStatus.ready ? 'ok' : 'degraded',
        service: 'Tong Service IT Billing API',
        version: '4.0.0',
        database_time: databaseResult.rows[0].database_time,
        database_schema: schemaStatus,
        latest_migration: migrationsResult.rows[0] || null
    });
}));

module.exports = router;
