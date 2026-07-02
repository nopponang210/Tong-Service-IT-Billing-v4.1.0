require('dotenv').config();

const pool = require('../src/config/db');
const { getDocumentSchemaStatus } = require('../src/services/schema.service');

async function check() {
    const result = await pool.query(`
        SELECT filename, applied_at
        FROM schema_migrations
        ORDER BY applied_at
    `).catch(() => ({ rows: [] }));
    const status = await getDocumentSchemaStatus(pool);

    console.log('Applied migrations:');
    if (!result.rows.length) console.log('- none');
    result.rows.forEach((row) => console.log(`- ${row.filename}`));

    console.log(`Document schema: ${status.ready ? 'READY' : 'NOT READY'}`);
    if (status.missing.length) console.log(`Missing columns: ${status.missing.join(', ')}`);
    if (!status.ready) process.exitCode = 1;
}

check()
    .catch((error) => {
        console.error('Schema check failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
