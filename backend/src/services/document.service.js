const pool = require('../config/db');
const AppError = require('../utils/app-error');
const { calculateDocumentTotals } = require('../utils/money');
const { assertDocumentTypeAllowed, allowedSourceTypes } = require('../utils/document-rules');
const { formatPeriod, formatDocumentNumber } = require('../utils/document-number');
const {
    canEditDocument,
    canCancelDocument,
    canSoftDeleteDocument
} = require('../utils/document-lifecycle');
const { writeAudit } = require('./audit.service');
const { assertDocumentSchemaReady } = require('./schema.service');

async function getSettings(client = pool) {
    const result = await client.query('SELECT * FROM settings WHERE id = 1');
    return result.rows[0];
}

async function nextDocumentNumber(client, documentType, documentDate, numberingConfig) {
    const config = numberingConfig[documentType] || {
        prefix: documentType,
        digits: 3,
        period: 'BYYMM',
        separator: '-'
    };
    const periodKey = formatPeriod(documentDate, config.period);
    const counterResult = await client.query(
        `INSERT INTO document_counters (document_type, period_key, last_number)
         VALUES ($1, $2, 1)
         ON CONFLICT (document_type, period_key)
         DO UPDATE SET last_number = document_counters.last_number + 1, updated_at = NOW()
         RETURNING last_number`,
        [documentType, periodKey]
    );
    return formatDocumentNumber({
        config,
        sequence: counterResult.rows[0].last_number,
        periodKey
    });
}

async function getSourceDocuments(client, ids) {
    if (!ids.length) return [];
    const result = await client.query(
        `SELECT d.*, c.customer_type
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.id = ANY($1::bigint[])
           AND d.deleted_at IS NULL
         ORDER BY d.document_date, d.id
         FOR UPDATE OF d`,
        [ids]
    );
    if (result.rows.length !== ids.length) {
        throw new AppError(404, 'ไม่พบเอกสารต้นทางบางรายการ', 'SOURCE_DOCUMENT_NOT_FOUND');
    }
    return result.rows;
}

async function getItemsForDocument(client, documentId) {
    const result = await client.query(
        `SELECT line_type, item_type, product_id, description, quantity, unit,
                unit_price, text_style
         FROM document_items
         WHERE document_id = $1
         ORDER BY sort_order`,
        [documentId]
    );
    return result.rows;
}

function aggregateSourceItems(sourceDocuments, label) {
    return sourceDocuments.map((source) => ({
        line_type: 'item',
        item_type: 'other',
        product_id: null,
        description: `${label} ${source.document_number}`,
        quantity: '1',
        unit: 'ฉบับ',
        unit_price: source.grand_total,
        text_style: 'normal'
    }));
}

async function resolveItems(client, body, sources) {
    if (body.items.length) return body.items;
    if (!sources.length) return [];

    if (body.document_type === 'BN') {
        return aggregateSourceItems(sources, 'ยอดตามใบแจ้งหนี้');
    }
    if (body.document_type === 'RC' && sources.length > 1) {
        return aggregateSourceItems(sources, 'รับชำระตามเอกสาร');
    }
    return getItemsForDocument(client, sources[0].id);
}

function customerSnapshot(customer) {
    return {
        code: customer.code,
        name: customer.name,
        customer_type: customer.customer_type,
        tax_id: customer.tax_id,
        branch_name: customer.branch_name,
        address: customer.address,
        email: customer.email,
        phone: customer.phone
    };
}

async function insertItems(client, documentId, items) {
    for (const item of items) {
        await client.query(
            `INSERT INTO document_items (
                document_id, sort_order, line_type, item_type, product_id,
                description, quantity, unit, unit_price, line_total, text_style
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                documentId, item.sort_order, item.line_type, item.item_type,
                item.product_id, item.description, item.quantity, item.unit,
                item.unit_price, item.line_total, item.text_style
            ]
        );
    }
}

async function insertSignatureSnapshot(client, documentId, settings, showSignature) {
    if (!showSignature || !settings.saved_signature_url) return;
    await client.query(
        `INSERT INTO document_signatures
            (document_id, role, signer_name, signature_url, signed_at)
         VALUES ($1, 'issuer', $2, $3, NOW())`,
        [documentId, settings.shop_owner || null, settings.saved_signature_url]
    );
}

async function syncSignatureSnapshot(client, documentId, settings, showSignature) {
    if (!showSignature) {
        await client.query(
            `DELETE FROM document_signatures
             WHERE document_id = $1
               AND role = 'issuer'`,
            [documentId]
        );
        return;
    }

    const existing = await client.query(
        `SELECT 1
         FROM document_signatures
         WHERE document_id = $1
           AND role = 'issuer'
         LIMIT 1`,
        [documentId]
    );

    if (!existing.rows.length) {
        await insertSignatureSnapshot(client, documentId, settings, true);
    }
}

async function assertBillingInvoicesAvailable(client, sourceIds) {
    if (!sourceIds.length) return;

    const result = await client.query(
        `SELECT
            inv.document_number AS invoice_number,
            bn.document_number AS billing_number
         FROM document_relations r
         JOIN documents inv ON inv.id = r.source_document_id
         JOIN documents bn ON bn.id = r.target_document_id
         WHERE r.source_document_id = ANY($1::bigint[])
           AND r.relation_type = 'INCLUDED_IN'
           AND bn.document_type = 'BN'
           AND bn.deleted_at IS NULL
           AND bn.status <> 'CANCELLED'
         LIMIT 20`,
        [sourceIds]
    );

    if (result.rows.length) {
        const details = result.rows
            .map((row) => `${row.invoice_number} อยู่ใน ${row.billing_number}`)
            .join(', ');
        throw new AppError(
            409,
            `ใบแจ้งหนี้บางใบถูกนำไปวางบิลแล้ว: ${details}`,
            'INVOICE_ALREADY_BILLED'
        );
    }
}

async function setBillingStatementPaid(client, billingStatementId, userId) {
    await client.query(
        `UPDATE documents
         SET status = 'PAID', updated_by = $1
         WHERE id = $2
           AND document_type = 'BN'
           AND deleted_at IS NULL
           AND status <> 'CANCELLED'`,
        [userId, billingStatementId]
    );

    await client.query(
        `UPDATE documents inv
         SET status = 'PAID', updated_by = $1
         FROM document_relations r
         WHERE r.target_document_id = $2
           AND r.relation_type = 'INCLUDED_IN'
           AND r.source_document_id = inv.id
           AND inv.document_type = 'IN'
           AND inv.deleted_at IS NULL
           AND inv.status <> 'CANCELLED'`,
        [userId, billingStatementId]
    );
}

async function restoreBillingStatementWorkflow(client, billingStatementId, userId) {
    const activeReceiptResult = await client.query(
        `SELECT 1
         FROM document_relations r
         JOIN documents rc ON rc.id = r.target_document_id
         WHERE r.source_document_id = $1
           AND r.relation_type = 'PAID_BY'
           AND rc.document_type = 'RC'
           AND rc.deleted_at IS NULL
           AND rc.status <> 'CANCELLED'
         LIMIT 1`,
        [billingStatementId]
    );

    if (activeReceiptResult.rows.length) {
        await setBillingStatementPaid(client, billingStatementId, userId);
        return;
    }

    await client.query(
        `UPDATE documents inv
         SET status = CASE
                WHEN inv.due_date IS NOT NULL AND inv.due_date < CURRENT_DATE
                THEN 'OVERDUE'
                ELSE 'PENDING'
             END,
             updated_by = $1
         FROM document_relations r
         WHERE r.target_document_id = $2
           AND r.relation_type = 'INCLUDED_IN'
           AND r.source_document_id = inv.id
           AND inv.document_type = 'IN'
           AND inv.deleted_at IS NULL
           AND inv.status <> 'CANCELLED'`,
        [userId, billingStatementId]
    );

    await refreshBillingStatements(client, userId, [billingStatementId]);
}

async function updateRelatedWorkflow(client, target, sources) {
    for (const source of sources) {
        let relationType = 'CONVERTED_TO';
        if (target.document_type === 'BN') relationType = 'INCLUDED_IN';
        if (target.document_type === 'RC') relationType = 'PAID_BY';

        await client.query(
            `INSERT INTO document_relations
                (source_document_id, target_document_id, relation_type)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [source.id, target.id, relationType]
        );

        if (source.document_type === 'QT' && ['IN', 'DO'].includes(target.document_type)) {
            await client.query(
                `UPDATE documents
                 SET status = 'APPROVED', updated_by = $1
                 WHERE id = $2
                   AND status <> 'CANCELLED'
                   AND deleted_at IS NULL`,
                [target.created_by, source.id]
            );
        }

        if (target.document_type === 'RC') {
            if (['QT', 'IN', 'DO'].includes(source.document_type)) {
                await client.query(
                    `UPDATE documents
                     SET status = 'PAID', updated_by = $1
                     WHERE id = $2
                       AND status <> 'CANCELLED'
                       AND deleted_at IS NULL`,
                    [target.created_by, source.id]
                );
            }

            if (source.document_type === 'BN') {
                await setBillingStatementPaid(client, source.id, target.created_by);
            }
        }
    }

    if (target.document_type === 'RC') {
        await refreshBillingStatements(client, target.created_by);
    }
}

async function refreshBillingStatements(client, userId, billingStatementIds = null) {
    const params = [userId];
    let targetFilter = '';
    if (billingStatementIds?.length) {
        params.push(billingStatementIds);
        targetFilter = 'AND bn.id = ANY($2::bigint[])';
    }

    await client.query(
        `UPDATE documents bn
         SET status = CASE
             WHEN NOT EXISTS (
                 SELECT 1
                 FROM document_relations r
                 JOIN documents inv ON inv.id = r.source_document_id
                 WHERE r.target_document_id = bn.id
                   AND r.relation_type = 'INCLUDED_IN'
                   AND (inv.deleted_at IS NOT NULL OR inv.status <> 'PAID')
             ) THEN 'PAID'
             WHEN bn.due_date IS NOT NULL AND bn.due_date < CURRENT_DATE THEN 'OVERDUE'
             ELSE 'PENDING'
         END,
         updated_by = $1
         WHERE bn.document_type = 'BN'
           AND bn.deleted_at IS NULL
           AND bn.status <> 'CANCELLED'
           AND EXISTS (
               SELECT 1 FROM document_relations r
               WHERE r.target_document_id = bn.id AND r.relation_type = 'INCLUDED_IN'
           )
           ${targetFilter}`,
        params
    );
}

async function refreshSourceWorkflowAfterTargetChange(client, targetId, userId) {
    const relationResult = await client.query(
        `SELECT DISTINCT s.id, s.document_type
         FROM document_relations r
         JOIN documents s ON s.id = r.source_document_id
         WHERE r.target_document_id = $1`,
        [targetId]
    );

    const billingStatementIds = new Set();
    for (const source of relationResult.rows) {
        if (source.document_type === 'QT') {
            await client.query(
                `UPDATE documents q
                 SET status = CASE
                     WHEN EXISTS (
                         SELECT 1
                         FROM document_relations r
                         JOIN documents rc ON rc.id = r.target_document_id
                         WHERE r.source_document_id = q.id
                           AND r.relation_type = 'PAID_BY'
                           AND rc.document_type = 'RC'
                           AND rc.deleted_at IS NULL
                           AND rc.status <> 'CANCELLED'
                     ) THEN 'PAID'
                     WHEN EXISTS (
                         SELECT 1
                         FROM document_relations r
                         JOIN documents t ON t.id = r.target_document_id
                         WHERE r.source_document_id = q.id
                           AND r.relation_type = 'CONVERTED_TO'
                           AND t.deleted_at IS NULL
                           AND t.status <> 'CANCELLED'
                     ) THEN 'APPROVED'
                     ELSE 'PENDING'
                 END,
                 updated_by = $1
                 WHERE q.id = $2 AND q.deleted_at IS NULL AND q.status <> 'CANCELLED'`,
                [userId, source.id]
            );
        }

        if (source.document_type === 'DO') {
            await client.query(
                `UPDATE documents delivery
                 SET status = CASE WHEN EXISTS (
                     SELECT 1
                     FROM document_relations r
                     JOIN documents rc ON rc.id = r.target_document_id
                     WHERE r.source_document_id = delivery.id
                       AND r.relation_type = 'PAID_BY'
                       AND rc.document_type = 'RC'
                       AND rc.deleted_at IS NULL
                       AND rc.status <> 'CANCELLED'
                 ) THEN 'PAID' ELSE 'PENDING' END,
                 updated_by = $1
                 WHERE delivery.id = $2
                   AND delivery.deleted_at IS NULL
                   AND delivery.status <> 'CANCELLED'`,
                [userId, source.id]
            );
        }

        if (source.document_type === 'BN') {
            await restoreBillingStatementWorkflow(client, source.id, userId);
        }

        if (source.document_type === 'IN') {
            await client.query(
                `UPDATE documents inv
                 SET status = CASE WHEN EXISTS (
                     SELECT 1
                     FROM document_relations r
                     JOIN documents rc ON rc.id = r.target_document_id
                     WHERE r.source_document_id = inv.id
                       AND r.relation_type = 'PAID_BY'
                       AND rc.document_type = 'RC'
                       AND rc.deleted_at IS NULL
                       AND rc.status <> 'CANCELLED'
                 ) THEN 'PAID'
                 WHEN inv.due_date IS NOT NULL AND inv.due_date < CURRENT_DATE THEN 'OVERDUE'
                 ELSE 'PENDING' END,
                 updated_by = $1
                 WHERE inv.id = $2 AND inv.deleted_at IS NULL AND inv.status <> 'CANCELLED'`,
                [userId, source.id]
            );

            const bnResult = await client.query(
                `SELECT target_document_id
                 FROM document_relations
                 WHERE source_document_id = $1 AND relation_type = 'INCLUDED_IN'`,
                [source.id]
            );
            bnResult.rows.forEach((row) => billingStatementIds.add(Number(row.target_document_id)));
        }
    }

    if (billingStatementIds.size) {
        await refreshBillingStatements(client, userId, [...billingStatementIds]);
    }
}

async function getLockedDocument(client, id, { includeDeleted = false } = {}) {
    const result = await client.query(
        `SELECT * FROM documents
         WHERE id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
         FOR UPDATE`,
        [id]
    );
    const document = result.rows[0];
    if (!document) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');
    return document;
}

async function assertNoActiveDependents(client, documentId) {
    const result = await client.query(
        `SELECT t.document_number, t.document_type, t.status
         FROM document_relations r
         JOIN documents t ON t.id = r.target_document_id
         WHERE r.source_document_id = $1
           AND t.deleted_at IS NULL
           AND t.status <> 'CANCELLED'
         ORDER BY t.document_date, t.id
         LIMIT 10`,
        [documentId]
    );
    if (result.rows.length) {
        const numbers = result.rows.map((row) => row.document_number).join(', ');
        throw new AppError(
            409,
            `เอกสารนี้ถูกนำไปสร้างเอกสารอื่นแล้ว กรุณายกเลิกเอกสารปลายทางก่อน: ${numbers}`,
            'DOCUMENT_HAS_ACTIVE_DEPENDENTS'
        );
    }
}

async function createDocument({ body, userId }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await assertDocumentSchemaReady(client);

        const customerResult = await client.query(
            `SELECT * FROM customers WHERE id = $1 AND active = TRUE FOR SHARE`,
            [body.customer_id]
        );
        const customer = customerResult.rows[0];
        if (!customer) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
        if (!assertDocumentTypeAllowed(customer.customer_type, body.document_type)) {
            throw new AppError(400, 'ประเภทลูกค้านี้ไม่รองรับเอกสารที่เลือก', 'DOCUMENT_TYPE_NOT_ALLOWED');
        }

        const sources = await getSourceDocuments(client, body.source_document_ids);

        if (body.document_type === 'QT' && sources.length) {
            throw new AppError(400, 'ใบเสนอราคาไม่ต้องมีเอกสารต้นทาง', 'SOURCE_NOT_ALLOWED');
        }
        if (body.document_type === 'BN' && sources.length === 0) {
            throw new AppError(400, 'ใบวางบิลต้องเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ', 'BILLING_SOURCE_REQUIRED');
        }
        if (body.document_type !== 'BN' && sources.length > 1) {
            throw new AppError(400, 'เอกสารประเภทนี้เลือกเอกสารต้นทางได้เพียง 1 ใบ', 'TOO_MANY_SOURCE_DOCUMENTS');
        }

        const allowedSources = allowedSourceTypes(customer.customer_type, body.document_type);
        for (const source of sources) {
            if (Number(source.customer_id) !== Number(customer.id)) {
                throw new AppError(400, 'เอกสารต้นทางต้องเป็นของลูกค้ารายเดียวกัน', 'SOURCE_CUSTOMER_MISMATCH');
            }
            if (!allowedSources.includes(source.document_type)) {
                throw new AppError(400, `ไม่สามารถใช้ ${source.document_type} เป็นเอกสารต้นทางได้`, 'INVALID_SOURCE_TYPE');
            }
            if (['CANCELLED', 'PAID', 'REJECTED'].includes(source.status)) {
                throw new AppError(
                    400,
                    'ไม่สามารถใช้เอกสารที่ยกเลิก ปฏิเสธ หรือชำระแล้วเป็นเอกสารต้นทาง',
                    'SOURCE_STATUS_NOT_ALLOWED'
                );
            }
        }

        if (body.document_type === 'BN') {
            await assertBillingInvoicesAvailable(client, body.source_document_ids);
        }

        const resolvedItems = await resolveItems(client, body, sources);
        if (!resolvedItems.length) {
            throw new AppError(400, 'กรุณาเพิ่มรายการสินค้า/บริการ', 'ITEMS_REQUIRED');
        }

        const totals = calculateDocumentTotals({
            items: resolvedItems,
            discount: body.discount,
            customer,
            documentType: body.document_type,
            receiptPayment: body.document_type === 'RC' ? {
                withholding_enabled: body.receipt_withholding_enabled,
                withholding_rate: body.receipt_withholding_rate,
                withholding_amount: body.receipt_withholding_amount,
                transfer_fee: body.receipt_transfer_fee
            } : null
        });
        const settings = await getSettings(client);
        const documentNumber = await nextDocumentNumber(
            client,
            body.document_type,
            body.document_date,
            settings.numbering_config
        );

        const documentResult = await client.query(
            `INSERT INTO documents (
                document_number, document_type, status, document_date, due_date,
                customer_id, customer_snapshot, product_subtotal, service_subtotal,
                other_subtotal, subtotal, discount, grand_total, withholding_rate,
                withholding_base, withholding_amount, withholding_is_actual,
                transfer_fee, net_total, payment_received_date,
                withholding_certificate_number, withholding_certificate_date,
                remarks, payment_terms, delivery_days, quotation_validity_days,
                show_signature, created_by, updated_by
             ) VALUES (
                $1,
                $2::varchar(2),
                CASE WHEN $2::varchar(2) = 'RC' THEN 'PAID' ELSE 'PENDING' END,
                $3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$27
             ) RETURNING *`,
            [
                documentNumber,
                body.document_type,
                body.document_date,
                body.due_date,
                customer.id,
                JSON.stringify(customerSnapshot(customer)),
                totals.productSubtotal,
                totals.serviceSubtotal,
                totals.otherSubtotal,
                totals.subtotal,
                totals.discount,
                totals.grandTotal,
                totals.withholdingRate,
                totals.withholdingBase,
                totals.withholdingAmount,
                totals.withholdingIsActual,
                totals.transferFee,
                totals.netTotal,
                body.document_type === 'RC'
                    ? (body.payment_received_date || body.document_date)
                    : null,
                body.document_type === 'RC'
                    ? body.withholding_certificate_number
                    : null,
                body.document_type === 'RC'
                    ? body.withholding_certificate_date
                    : null,
                body.remarks,
                body.payment_terms,
                body.delivery_days ?? null,
                body.quotation_validity_days ?? null,
                Boolean(body.show_signature),
                userId
            ]
        );
        const document = documentResult.rows[0];

        await insertItems(client, document.id, totals.items);
        await insertSignatureSnapshot(client, document.id, settings, body.show_signature);
        await updateRelatedWorkflow(client, document, sources);
        await writeAudit(client, {
            userId,
            action: 'CREATE',
            entityType: 'document',
            entityId: document.id,
            details: {
                number: document.document_number,
                type: document.document_type,
                grandTotal: document.grand_total,
                showSignature: Boolean(body.show_signature),
                sourceDocumentIds: body.source_document_ids
            }
        });

        await client.query('COMMIT');
        return getDocumentById(document.id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function updateDocument({ id, body, userId, role }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await assertDocumentSchemaReady(client);
        const current = await getLockedDocument(client, id);

        if (!canEditDocument(role, current.status, current.deleted_at)) {
            throw new AppError(403, 'สถานะเอกสารหรือสิทธิ์ผู้ใช้ไม่อนุญาตให้แก้ไข', 'DOCUMENT_EDIT_NOT_ALLOWED');
        }
        if (body.document_type !== current.document_type) {
            throw new AppError(400, 'ไม่สามารถเปลี่ยนประเภทเอกสารหลังสร้างแล้ว', 'DOCUMENT_TYPE_IMMUTABLE');
        }
        await assertNoActiveDependents(client, id);

        const customerResult = await client.query(
            `SELECT * FROM customers WHERE id = $1 AND active = TRUE FOR SHARE`,
            [body.customer_id]
        );
        const customer = customerResult.rows[0];
        if (!customer) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
        if (!assertDocumentTypeAllowed(customer.customer_type, current.document_type)) {
            throw new AppError(400, 'ประเภทลูกค้านี้ไม่รองรับเอกสารดังกล่าว', 'DOCUMENT_TYPE_NOT_ALLOWED');
        }

        const relationCustomers = await client.query(
            `SELECT DISTINCT s.customer_id
             FROM document_relations r
             JOIN documents s ON s.id = r.source_document_id
             WHERE r.target_document_id = $1`,
            [id]
        );
        if (relationCustomers.rows.some((row) => Number(row.customer_id) !== Number(customer.id))) {
            throw new AppError(409, 'ไม่สามารถเปลี่ยนลูกค้า เพราะเอกสารเชื่อมโยงกับเอกสารต้นทางของลูกค้ารายเดิม', 'RELATED_CUSTOMER_MISMATCH');
        }

        const totals = calculateDocumentTotals({
            items: body.items,
            discount: body.discount,
            customer,
            documentType: current.document_type,
            receiptPayment: current.document_type === 'RC' ? {
                withholding_enabled: body.receipt_withholding_enabled,
                withholding_rate: body.receipt_withholding_rate,
                withholding_amount: body.receipt_withholding_amount,
                transfer_fee: body.receipt_transfer_fee
            } : null
        });

        await client.query(
            `UPDATE documents SET
                document_date = $1,
                due_date = $2,
                customer_id = $3,
                customer_snapshot = $4::jsonb,
                product_subtotal = $5,
                service_subtotal = $6,
                other_subtotal = $7,
                subtotal = $8,
                discount = $9,
                grand_total = $10,
                withholding_rate = $11,
                withholding_base = $12,
                withholding_amount = $13,
                withholding_is_actual = $14,
                transfer_fee = $15,
                net_total = $16,
                payment_received_date = $17,
                withholding_certificate_number = $18,
                withholding_certificate_date = $19,
                remarks = $20,
                payment_terms = $21,
                delivery_days = $22,
                quotation_validity_days = $23,
                show_signature = $24,
                updated_by = $25
             WHERE id = $26`,
            [
                body.document_date,
                body.due_date,
                customer.id,
                JSON.stringify(customerSnapshot(customer)),
                totals.productSubtotal,
                totals.serviceSubtotal,
                totals.otherSubtotal,
                totals.subtotal,
                totals.discount,
                totals.grandTotal,
                totals.withholdingRate,
                totals.withholdingBase,
                totals.withholdingAmount,
                totals.withholdingIsActual,
                totals.transferFee,
                totals.netTotal,
                current.document_type === 'RC'
                    ? (body.payment_received_date || body.document_date)
                    : null,
                current.document_type === 'RC'
                    ? body.withholding_certificate_number
                    : null,
                current.document_type === 'RC'
                    ? body.withholding_certificate_date
                    : null,
                body.remarks,
                body.payment_terms,
                body.delivery_days ?? null,
                body.quotation_validity_days ?? null,
                Boolean(body.show_signature),
                userId,
                id
            ]
        );
        await client.query('DELETE FROM document_items WHERE document_id = $1', [id]);
        await insertItems(client, id, totals.items);
        await syncSignatureSnapshot(
            client,
            id,
            await getSettings(client),
            body.show_signature
        );

        await writeAudit(client, {
            userId,
            action: 'UPDATE',
            entityType: 'document',
            entityId: id,
            details: {
                number: current.document_number,
                status: current.status,
                before: {
                    customerId: current.customer_id,
                    documentDate: current.document_date,
                    dueDate: current.due_date,
                    grandTotal: current.grand_total,
                    netTotal: current.net_total
                },
                after: {
                    customerId: customer.id,
                    documentDate: body.document_date,
                    dueDate: body.due_date,
                    grandTotal: totals.grandTotal,
                    netTotal: totals.netTotal,
                    showSignature: Boolean(body.show_signature),
                    itemCount: totals.items.length
                }
            }
        });

        await client.query('COMMIT');
        return getDocumentById(id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function getDocumentById(id, { includeDeleted = false } = {}) {
    const documentResult = await pool.query(
        `SELECT d.*, c.name AS customer_name, u.name AS created_by_name,
                uu.name AS updated_by_name, cu.name AS cancelled_by_name,
                du.name AS deleted_by_name
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         JOIN users u ON u.id = d.created_by
         LEFT JOIN users uu ON uu.id = d.updated_by
         LEFT JOIN users cu ON cu.id = d.cancelled_by
         LEFT JOIN users du ON du.id = d.deleted_by
         WHERE d.id = $1 ${includeDeleted ? '' : 'AND d.deleted_at IS NULL'}`,
        [id]
    );
    const document = documentResult.rows[0];
    if (!document) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');

    const [itemsResult, relationsResult, signaturesResult, settings] = await Promise.all([
        pool.query(`SELECT * FROM document_items WHERE document_id = $1 ORDER BY sort_order`, [id]),
        pool.query(
            `SELECT r.*, s.document_number AS source_number, s.document_type AS source_type,
                    s.deleted_at AS source_deleted_at,
                    t.document_number AS target_number, t.document_type AS target_type,
                    t.deleted_at AS target_deleted_at
             FROM document_relations r
             JOIN documents s ON s.id = r.source_document_id
             JOIN documents t ON t.id = r.target_document_id
             WHERE r.source_document_id = $1 OR r.target_document_id = $1
             ORDER BY r.id`,
            [id]
        ),
        pool.query(`SELECT * FROM document_signatures WHERE document_id = $1 ORDER BY id`, [id]),
        getSettings()
    ]);

    return {
        ...document,
        items: itemsResult.rows,
        relations: relationsResult.rows,
        signatures: signaturesResult.rows,
        settings
    };
}

async function listDocuments(query, { role } = {}) {
    const offset = (query.page - 1) * query.limit;
    const params = [];
    const conditions = [];

    if (query.deleted_only) {
        if (role !== 'admin') throw new AppError(403, 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปิดถังขยะได้', 'ADMIN_REQUIRED');
        conditions.push('d.deleted_at IS NOT NULL');
    } else {
        conditions.push('d.deleted_at IS NULL');
    }

    if (query.search) {
        params.push(`%${query.search}%`);
        conditions.push(`(d.document_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (query.type) {
        params.push(query.type);
        conditions.push(`d.document_type = $${params.length}`);
    }
    if (query.status) {
        params.push(query.status);
        conditions.push(`d.status = $${params.length}`);
    }
    if (query.customer_id) {
        params.push(query.customer_id);
        conditions.push(`d.customer_id = $${params.length}`);
    }
    if (query.month) {
        params.push(`${query.month}-01`);
        conditions.push(`d.document_date >= $${params.length}::date AND d.document_date < ($${params.length}::date + INTERVAL '1 month')`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(query.limit, offset);
    const dataResult = await pool.query(
        `SELECT d.id, d.document_number, d.document_type, d.status, d.document_date,
                d.due_date, d.grand_total, d.net_total, d.withholding_amount,
                d.transfer_fee, d.cancelled_at, d.cancellation_reason,
                d.deleted_at, d.deletion_reason,
                c.name AS customer_name, c.customer_type
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         ${where}
         ORDER BY COALESCE(d.deleted_at, d.document_date::timestamptz) DESC, d.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    const countParams = params.slice(0, -2);
    const countResult = await pool.query(
        `SELECT COUNT(*)::integer AS total
         FROM documents d JOIN customers c ON c.id = d.customer_id ${where}`,
        countParams
    );

    return {
        data: dataResult.rows,
        pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total }
    };
}

async function listAvailableSources({ target_type, customer_id }) {
    const customerResult = await pool.query('SELECT customer_type FROM customers WHERE id = $1', [customer_id]);
    const customer = customerResult.rows[0];
    if (!customer) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
    const types = allowedSourceTypes(customer.customer_type, target_type);
    if (!types.length) return [];

    const result = await pool.query(
        `SELECT d.id, d.document_number, d.document_type, d.status,
                d.document_date, d.due_date, d.grand_total
         FROM documents d
         WHERE d.customer_id = $1
           AND d.document_type = ANY($2::varchar[])
           AND d.status NOT IN ('CANCELLED', 'PAID', 'REJECTED')
           AND d.deleted_at IS NULL
           AND (
                $3::varchar(2) <> 'BN'
                OR NOT EXISTS (
                    SELECT 1
                    FROM document_relations r
                    JOIN documents bn ON bn.id = r.target_document_id
                    WHERE r.source_document_id = d.id
                      AND r.relation_type = 'INCLUDED_IN'
                      AND bn.document_type = 'BN'
                      AND bn.deleted_at IS NULL
                      AND bn.status <> 'CANCELLED'
                )
           )
         ORDER BY d.document_date DESC, d.id DESC
         LIMIT 100`,
        [customer_id, types, target_type]
    );
    return result.rows;
}

const allowedTransitions = {
    DRAFT: ['PENDING', 'REJECTED'],
    PENDING: ['APPROVED', 'IN_PROGRESS', 'REJECTED', 'PAID', 'OVERDUE'],
    APPROVED: ['IN_PROGRESS', 'REJECTED', 'PAID', 'OVERDUE'],
    IN_PROGRESS: ['PAID', 'REJECTED', 'OVERDUE'],
    REJECTED: [],
    OVERDUE: ['PAID'],
    PAID: [],
    CANCELLED: []
};

async function updateDocumentStatus({ id, status, userId }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await getLockedDocument(client, id);

        if (status === 'PAID' && current.document_type !== 'RC') {
            throw new AppError(
                409,
                'สถานะชำระแล้วต้องเกิดจากการออกใบเสร็จรับเงินเท่านั้น',
                'RECEIPT_REQUIRED_FOR_PAYMENT'
            );
        }

        const transitions = allowedTransitions[current.status] || [];
        if (current.status !== status && !transitions.includes(status)) {
            throw new AppError(409, `ไม่สามารถเปลี่ยนสถานะจาก ${current.status} เป็น ${status}`, 'INVALID_STATUS_TRANSITION');
        }
        await client.query(`UPDATE documents SET status = $1, updated_by = $2 WHERE id = $3`, [status, userId, id]);
        if (current.document_type === 'IN') {
            const bnResult = await client.query(
                `SELECT target_document_id FROM document_relations
                 WHERE source_document_id = $1 AND relation_type = 'INCLUDED_IN'`,
                [id]
            );
            if (bnResult.rows.length) {
                await refreshBillingStatements(client, userId, bnResult.rows.map((row) => Number(row.target_document_id)));
            }
        }
        await writeAudit(client, {
            userId,
            action: 'UPDATE_STATUS',
            entityType: 'document',
            entityId: id,
            details: { number: current.document_number, from: current.status, to: status }
        });
        await client.query('COMMIT');
        return getDocumentById(id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function cancelDocument({ id, reason, userId, role }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await getLockedDocument(client, id);
        if (!canCancelDocument(role, current.status, current.deleted_at)) {
            throw new AppError(403, 'สถานะเอกสารหรือสิทธิ์ผู้ใช้ไม่อนุญาตให้ยกเลิก', 'DOCUMENT_CANCEL_NOT_ALLOWED');
        }
        await assertNoActiveDependents(client, id);

        await client.query(
            `UPDATE documents
             SET status = 'CANCELLED', cancellation_reason = $1,
                 cancelled_at = NOW(), cancelled_by = $2, updated_by = $2
             WHERE id = $3`,
            [reason, userId, id]
        );
        await refreshSourceWorkflowAfterTargetChange(client, id, userId);
        await writeAudit(client, {
            userId,
            action: 'CANCEL',
            entityType: 'document',
            entityId: id,
            details: { number: current.document_number, previousStatus: current.status, reason }
        });
        await client.query('COMMIT');
        return getDocumentById(id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function softDeleteDocument({ id, reason, userId, role }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await getLockedDocument(client, id);
        if (!canSoftDeleteDocument(role, current.status, current.deleted_at)) {
            throw new AppError(403, 'ต้องเป็นเอกสารร่าง/รอดำเนินการ หรือเอกสารที่ยกเลิกแล้วตามสิทธิ์ของคุณ', 'DOCUMENT_DELETE_NOT_ALLOWED');
        }
        await assertNoActiveDependents(client, id);

        await client.query(
            `UPDATE documents
             SET deleted_at = NOW(), deleted_by = $1, deletion_reason = $2, updated_by = $1
             WHERE id = $3`,
            [userId, reason, id]
        );
        await refreshSourceWorkflowAfterTargetChange(client, id, userId);
        await writeAudit(client, {
            userId,
            action: 'SOFT_DELETE',
            entityType: 'document',
            entityId: id,
            details: { number: current.document_number, status: current.status, reason }
        });
        await client.query('COMMIT');
        return { id: Number(id), document_number: current.document_number, deleted: true };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function restoreDocument({ id, userId }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await getLockedDocument(client, id, { includeDeleted: true });
        if (!current.deleted_at) {
            throw new AppError(409, 'เอกสารนี้ไม่ได้อยู่ในถังขยะ', 'DOCUMENT_NOT_DELETED');
        }

        await client.query(
            `UPDATE documents
             SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, updated_by = $1
             WHERE id = $2`,
            [userId, id]
        );
        await refreshSourceWorkflowAfterTargetChange(client, id, userId);
        await writeAudit(client, {
            userId,
            action: 'RESTORE',
            entityType: 'document',
            entityId: id,
            details: { number: current.document_number, restoredFromDeletedAt: current.deleted_at }
        });
        await client.query('COMMIT');
        return getDocumentById(id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function getDocumentAudit(id) {
    const documentResult = await pool.query('SELECT document_number FROM documents WHERE id = $1', [id]);
    if (!documentResult.rows[0]) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');

    const result = await pool.query(
        `SELECT a.id, a.action, a.details, a.created_at,
                u.name AS user_name, u.email AS user_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.entity_type = 'document' AND a.entity_id = $1
         ORDER BY a.created_at DESC, a.id DESC`,
        [String(id)]
    );
    return {
        document_number: documentResult.rows[0].document_number,
        data: result.rows
    };
}

module.exports = {
    createDocument,
    updateDocument,
    getDocumentById,
    listDocuments,
    listAvailableSources,
    updateDocumentStatus,
    cancelDocument,
    softDeleteDocument,
    restoreDocument,
    getDocumentAudit,
    getSettings
};
