const AppError = require('../utils/app-error');

const REQUIRED_DOCUMENT_COLUMNS = [
    'withholding_is_actual',
    'payment_received_date',
    'withholding_certificate_number',
    'withholding_certificate_date',
    'show_signature'
];

let schemaReady = false;

async function getDocumentSchemaStatus(client) {
    const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'documents'
           AND column_name = ANY($1::text[])`,
        [REQUIRED_DOCUMENT_COLUMNS]
    );

    const found = new Set(result.rows.map((row) => row.column_name));
    const missing = REQUIRED_DOCUMENT_COLUMNS.filter((column) => !found.has(column));

    return {
        ready: missing.length === 0,
        required: REQUIRED_DOCUMENT_COLUMNS,
        missing
    };
}

async function assertDocumentSchemaReady(client) {
    if (schemaReady) return;

    const status = await getDocumentSchemaStatus(client);
    if (!status.ready) {
        throw new AppError(
            503,
            'ฐานข้อมูลยังไม่พร้อมสำหรับระบบเอกสารเวอร์ชันนี้ กรุณารัน Database Migration ให้ครบก่อน',
            'DOCUMENT_SCHEMA_OUTDATED',
            { missing_columns: status.missing }
        );
    }

    schemaReady = true;
}

module.exports = {
    REQUIRED_DOCUMENT_COLUMNS,
    getDocumentSchemaStatus,
    assertDocumentSchemaReady
};
