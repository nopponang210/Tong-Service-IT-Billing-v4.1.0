require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/config/db');
const { getDocumentSchemaStatus } = require('../src/services/schema.service');

function safeDatabaseHost() {
    try {
        return new URL(process.env.DATABASE_URL).hostname;
    } catch {
        return 'unknown-host';
    }
}

async function assertWritableDatabase() {
    const result = await pool.query(`
        SELECT
            current_user,
            current_setting('transaction_read_only') AS transaction_read_only,
            pg_is_in_recovery() AS is_read_replica
    `);
    const status = result.rows[0];
    if (status.transaction_read_only === 'on' || status.is_read_replica) {
        throw new Error(
            `Database is read-only (user=${status.current_user}, replica=${status.is_read_replica}). `
            + 'Use the Supabase Primary database or Session Pooler port 5432 with a write-enabled account.'
        );
    }
}

async function migrate() {
    const directory = path.resolve(__dirname, '../../database/migrations');
    if (!fs.existsSync(directory)) {
        throw new Error(`Migration directory not found: ${directory}`);
    }

    const files = fs.readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .sort();

    if (!files.length) throw new Error(`No SQL migrations found in: ${directory}`);

    console.log(`Database host: ${safeDatabaseHost()}`);
    console.log(`Migration directory: ${directory}`);
    await assertWritableDatabase();

    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename VARCHAR(255) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    for (const filename of files) {
        const sql = fs.readFileSync(path.join(directory, filename), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const existing = await pool.query(
            'SELECT checksum FROM schema_migrations WHERE filename = $1',
            [filename]
        );

        if (existing.rows[0]) {
            if (existing.rows[0].checksum !== checksum) {
                throw new Error(`Migration changed after apply: ${filename}`);
            }
            console.log(`Skipped: ${filename}`);
            continue;
        }

        await pool.query(sql);
        await pool.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
            [filename, checksum]
        );
        console.log(`Applied: ${filename}`);
    }

    const schemaStatus = await getDocumentSchemaStatus(pool);
    if (!schemaStatus.ready) {
        throw new Error(`Document schema is incomplete. Missing: ${schemaStatus.missing.join(', ')}`);
    }

    console.log('Schema check: ready');
    console.log('Database migration completed');
}

migrate()
    .catch((error) => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
