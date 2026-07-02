const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: env.databaseSsl
        ? { rejectUnauthorized: env.databaseSslRejectUnauthorized }
        : false
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

module.exports = pool;
