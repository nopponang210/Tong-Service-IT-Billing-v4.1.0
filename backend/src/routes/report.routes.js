const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { monthSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/monthly', validate(monthSchema, 'query'), asyncHandler(async (req, res) => {
    const start = `${req.query.month}-01`;
    const [summary, byType, documents] = await Promise.all([
        pool.query(`
          SELECT
            COALESCE(SUM(product_subtotal),0) AS product_total,
            COALESCE(SUM(service_subtotal),0) AS service_total,
            COALESCE(SUM(grand_total),0) AS gross_total,
            COALESCE(SUM(net_total) FILTER (WHERE document_type='RC'),0) AS received_total,
            COALESCE(SUM(withholding_amount) FILTER (WHERE document_type='RC'),0) AS withholding_total,
            COALESCE(SUM(transfer_fee),0) AS transfer_fee_total,
            COUNT(*)::integer AS document_count
          FROM documents
          WHERE document_date >= $1::date
            AND document_date < ($1::date + INTERVAL '1 month')
            AND status <> 'CANCELLED'
            AND deleted_at IS NULL`, [start]),
        pool.query(`
          SELECT document_type,COUNT(*)::integer AS count,COALESCE(SUM(grand_total),0) AS total
          FROM documents
          WHERE document_date >= $1::date
            AND document_date < ($1::date + INTERVAL '1 month')
            AND status <> 'CANCELLED'
            AND deleted_at IS NULL
          GROUP BY document_type ORDER BY document_type`, [start]),
        pool.query(`
          SELECT d.id,d.document_number,d.document_type,d.document_date,d.status,
                 d.grand_total,d.withholding_amount,d.transfer_fee,d.net_total,c.name AS customer_name
          FROM documents d JOIN customers c ON c.id=d.customer_id
          WHERE d.deleted_at IS NULL
            AND d.status <> 'CANCELLED'
            AND d.document_date >= $1::date
            AND d.document_date < ($1::date + INTERVAL '1 month')
          ORDER BY d.document_date,d.id`, [start])
    ]);
    res.json({ month: req.query.month, summary: summary.rows[0], by_type: byType.rows, documents: documents.rows });
}));

module.exports = router;
