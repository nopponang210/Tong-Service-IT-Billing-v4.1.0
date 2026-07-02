const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
router.use(authenticate);

function resolveMonths(value) {
    const parsed = Number.parseInt(value, 10);
    return parsed === 12 ? 12 : 6;
}

router.get('/', asyncHandler(async (req, res) => {
    const months = resolveMonths(req.query.months);
    const rangeStartSql = `date_trunc('month', CURRENT_DATE) - (($1::integer - 1) * INTERVAL '1 month')`;

    const [stats, recent, overdue, revenueTrend, aging, topCustomers, topServices, activity] = await Promise.all([
        pool.query(`
            SELECT
              COALESCE(SUM(net_total) FILTER (WHERE document_type='RC' AND document_date >= date_trunc('month', CURRENT_DATE)),0) AS monthly_income,
              COALESCE(SUM(grand_total) FILTER (
                WHERE status IN ('PENDING','APPROVED','OVERDUE')
                  AND (
                    document_type = 'BN'
                    OR (
                      document_type = 'IN'
                      AND NOT EXISTS (
                        SELECT 1
                        FROM document_relations r
                        JOIN documents bn ON bn.id = r.target_document_id
                        WHERE r.source_document_id = documents.id
                          AND r.relation_type = 'INCLUDED_IN'
                          AND bn.document_type = 'BN'
                          AND bn.deleted_at IS NULL
                          AND bn.status <> 'CANCELLED'
                      )
                    )
                  )
              ),0) AS outstanding,
              COALESCE(SUM(withholding_amount) FILTER (
                WHERE document_type='RC'
                  AND document_date >= date_trunc('year', CURRENT_DATE)
              ),0) AS yearly_withholding,
              COALESCE(SUM(transfer_fee) FILTER (WHERE document_date >= date_trunc('year', CURRENT_DATE)),0) AS yearly_transfer_fee
            FROM documents WHERE status <> 'CANCELLED' AND deleted_at IS NULL
        `),
        pool.query(`
            SELECT d.id,d.document_number,d.document_type,d.document_date,d.grand_total,d.status,c.name AS customer_name
            FROM documents d JOIN customers c ON c.id=d.customer_id
            WHERE d.status <> 'CANCELLED' AND d.deleted_at IS NULL
            ORDER BY d.document_date DESC,d.id DESC LIMIT 8
        `),
        pool.query(`
            SELECT d.id,d.document_number,d.due_date,d.grand_total,c.name AS customer_name
            FROM documents d JOIN customers c ON c.id=d.customer_id
            WHERE d.deleted_at IS NULL AND d.due_date < CURRENT_DATE AND d.status IN ('PENDING','APPROVED','OVERDUE')
            ORDER BY d.due_date LIMIT 8
        `),
        pool.query(`
            WITH months AS (
              SELECT generate_series(
                ${rangeStartSql},
                date_trunc('month', CURRENT_DATE),
                INTERVAL '1 month'
              )::date AS month_start
            ), receipts AS (
              SELECT date_trunc('month', document_date)::date AS month_start,
                     COALESCE(SUM(product_subtotal),0) AS product_total,
                     COALESCE(SUM(service_subtotal),0) AS service_total,
                     COALESCE(SUM(other_subtotal),0) AS other_total,
                     COALESCE(SUM(net_total),0) AS received_total,
                     COUNT(*)::integer AS receipt_count
              FROM documents
              WHERE document_type='RC' AND status <> 'CANCELLED' AND deleted_at IS NULL
                AND document_date >= ${rangeStartSql}
                AND document_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
              GROUP BY 1
            )
            SELECT to_char(m.month_start,'YYYY-MM') AS month,
                   COALESCE(r.product_total,0) AS product_total,
                   COALESCE(r.service_total,0) AS service_total,
                   COALESCE(r.other_total,0) AS other_total,
                   COALESCE(r.received_total,0) AS received_total,
                   COALESCE(r.receipt_count,0)::integer AS receipt_count
            FROM months m LEFT JOIN receipts r USING (month_start)
            ORDER BY m.month_start`, [months]),
        pool.query(`
            SELECT bucket, COALESCE(SUM(grand_total),0) AS total, COUNT(*)::integer AS count
            FROM (
              SELECT grand_total,
                CASE
                  WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'not_due'
                  WHEN CURRENT_DATE - due_date <= 30 THEN 'days_1_30'
                  WHEN CURRENT_DATE - due_date <= 60 THEN 'days_31_60'
                  ELSE 'days_61_plus'
                END AS bucket
              FROM documents
              WHERE document_type='IN' AND deleted_at IS NULL AND status IN ('PENDING','APPROVED','OVERDUE')
            ) x
            GROUP BY bucket`),
        pool.query(`
            SELECT c.name, COALESCE(SUM(d.net_total),0) AS total
            FROM documents d JOIN customers c ON c.id=d.customer_id
            WHERE d.document_type='RC' AND d.status <> 'CANCELLED' AND d.deleted_at IS NULL
              AND d.document_date >= ${rangeStartSql}
              AND d.document_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            GROUP BY c.id,c.name
            ORDER BY total DESC,c.name
            LIMIT 5`, [months]),
        pool.query(`
            SELECT i.description, COALESCE(SUM(i.line_total),0) AS total
            FROM document_items i
            JOIN documents d ON d.id=i.document_id
            WHERE d.document_type='RC' AND d.status <> 'CANCELLED' AND d.deleted_at IS NULL
              AND i.line_type='item' AND i.item_type='service'
              AND d.document_date >= ${rangeStartSql}
              AND d.document_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            GROUP BY i.description
            ORDER BY total DESC,i.description
            LIMIT 5`, [months]),
        pool.query(`
            WITH period_docs AS (
              SELECT * FROM documents
              WHERE status <> 'CANCELLED' AND deleted_at IS NULL
                AND document_date >= ${rangeStartSql}
                AND document_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            ), receipt_stats AS (
              SELECT COUNT(*)::integer AS receipt_count,
                     COALESCE(AVG(net_total),0) AS average_receipt
              FROM period_docs WHERE document_type='RC'
            ), quotation_stats AS (
              SELECT COUNT(*)::integer AS quotation_count,
                     COALESCE(SUM(CASE WHEN EXISTS (
                       SELECT 1 FROM document_relations r
                       WHERE r.source_document_id=d.id AND r.relation_type='CONVERTED_TO'
                     ) THEN 1 ELSE 0 END),0)::integer AS converted_quotation_count
              FROM period_docs d WHERE document_type='QT'
            )
            SELECT r.receipt_count,r.average_receipt,q.quotation_count,q.converted_quotation_count
            FROM receipt_stats r CROSS JOIN quotation_stats q`, [months])
    ]);

    const trendRows = revenueTrend.rows;
    const revenueMix = trendRows.reduce((acc, row) => {
        acc.product_total += Number(row.product_total || 0);
        acc.service_total += Number(row.service_total || 0);
        acc.other_total += Number(row.other_total || 0);
        return acc;
    }, { product_total: 0, service_total: 0, other_total: 0 });

    const agingMap = Object.fromEntries(aging.rows.map((row) => [row.bucket, row]));
    const quotationCount = Number(activity.rows[0].quotation_count || 0);
    const convertedCount = Number(activity.rows[0].converted_quotation_count || 0);

    res.json({
        stats: stats.rows[0],
        recent: recent.rows,
        overdue: overdue.rows,
        analytics: {
            months,
            revenue_trend: trendRows,
            revenue_mix: revenueMix,
            receivables_aging: ['not_due','days_1_30','days_31_60','days_61_plus'].map((bucket) => ({
                bucket,
                total: agingMap[bucket]?.total || 0,
                count: agingMap[bucket]?.count || 0
            })),
            top_customers: topCustomers.rows,
            top_services: topServices.rows,
            insights: {
                receipt_count: activity.rows[0].receipt_count || 0,
                average_receipt: activity.rows[0].average_receipt || 0,
                quotation_count: quotationCount,
                converted_quotation_count: convertedCount,
                quotation_conversion_rate: quotationCount > 0 ? Math.round((convertedCount / quotationCount) * 1000) / 10 : 0,
                top_customer: topCustomers.rows[0]?.name || null
            }
        }
    });
}));

module.exports = router;
