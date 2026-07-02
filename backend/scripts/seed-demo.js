require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function seed() {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../database/seeds/001_demo_data.sql'), 'utf8');
    await pool.query(sql);
    console.log('Demo data seeded');
}
seed().catch((e) => { console.error('Seed failed:', e.message); process.exitCode = 1; }).finally(() => pool.end());
