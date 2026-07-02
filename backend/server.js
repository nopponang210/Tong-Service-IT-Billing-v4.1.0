require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const pool = require('./src/config/db');
const env = require('./src/config/env');

async function start() {
    await pool.query('SELECT 1');
    const server = http.createServer(app);
    server.listen(env.port, '0.0.0.0', () => {
        console.log(`Tong Service IT Billing API running on http://localhost:${env.port}`);
    });

    const shutdown = async (signal) => {
        console.log(`\n${signal}: shutting down...`);
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(async (error) => {
    console.error('Failed to start server:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
