const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
router.use(authenticate, authorize('admin'));

router.get('/export', asyncHandler(async (_req, res) => {
    const tables = ['customers','products','settings','documents','document_items','document_relations','document_signatures','audit_logs'];
    const backup = { version: 2, exported_at: new Date().toISOString(), data: {} };
    for (const table of tables) {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
        backup.data[table] = result.rows;
    }
    res.setHeader('Content-Disposition', `attachment; filename="tong-billing-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
}));

module.exports = router;
