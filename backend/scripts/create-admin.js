require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { passwordSchema } = require('../src/validators/schemas');

async function run() {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!name || !email || !password) {
        throw new Error('กรุณากำหนด ADMIN_NAME, ADMIN_EMAIL และ ADMIN_PASSWORD ก่อนรันคำสั่ง');
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
        const messages = passwordResult.error.issues.map((issue) => issue.message).join(' / ');
        throw new Error(messages);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    let result;
    if (existing.rows[0]) {
        result = await pool.query(
            `UPDATE users SET name=$1,password_hash=$2,role='admin',active=TRUE WHERE id=$3 RETURNING id,name,email,role`,
            [name,passwordHash,existing.rows[0].id]
        );
    } else {
        result = await pool.query(
            `INSERT INTO users (name,email,password_hash,role) VALUES ($1,LOWER($2),$3,'admin') RETURNING id,name,email,role`,
            [name,email,passwordHash]
        );
    }
    console.log('สร้าง/อัปเดตผู้ดูแลระบบสำเร็จ:', result.rows[0]);
}
run().catch((e) => { console.error('สร้างผู้ดูแลระบบไม่สำเร็จ:', e.message); process.exitCode = 1; }).finally(() => pool.end());
