const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { writeAudit } = require('../services/audit.service');
const {
    idSchema,
    userCreateSchema,
    userPasswordResetSchema
} = require('../validators/schemas');

const router = express.Router();
router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query(`SELECT id,name,email,role,active,created_at FROM users ORDER BY active DESC,name`);
    res.json({ data: result.rows });
}));

router.post('/', validate(userCreateSchema), asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await pool.query(
        `INSERT INTO users (name,email,password_hash,role)
         VALUES ($1,LOWER($2),$3,$4)
         RETURNING id,name,email,role,active,created_at`,
        [req.body.name,req.body.email,passwordHash,req.body.role]
    );
    await writeAudit(pool, {
        userId: req.user.id,
        action: 'CREATE',
        entityType: 'user',
        entityId: result.rows[0].id,
        details: { email: result.rows[0].email, role: result.rows[0].role }
    });
    res.status(201).json({ data: result.rows[0] });
}));

router.patch('/:id/password', validate(idSchema, 'params'), validate(userPasswordResetSchema), asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await pool.query(
        `UPDATE users
         SET password_hash=$1, updated_at=NOW()
         WHERE id=$2 AND active=TRUE
         RETURNING id,name,email,role,active`,
        [passwordHash, req.params.id]
    );
    if (!result.rows[0]) {
        throw new AppError(404, 'ไม่พบผู้ใช้ที่กำลังใช้งาน', 'USER_NOT_FOUND');
    }
    await writeAudit(pool, {
        userId: req.user.id,
        action: 'RESET_PASSWORD',
        entityType: 'user',
        entityId: req.params.id,
        details: { email: result.rows[0].email }
    });
    res.json({ data: result.rows[0] });
}));

module.exports = router;
