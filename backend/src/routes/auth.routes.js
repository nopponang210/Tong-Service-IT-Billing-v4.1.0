const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { signToken } = require('../utils/jwt');
const { loginSchema } = require('../validators/schemas');

const router = express.Router();

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT id, name, email, password_hash, role, active
         FROM users WHERE LOWER(email) = LOWER($1)`,
        [req.body.email]
    );
    const user = result.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(req.body.password, user.password_hash))) {
        throw new AppError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'INVALID_CREDENTIALS');
    }
    const token = signToken(user);
    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
    res.json({ user: req.user });
}));

module.exports = router;
