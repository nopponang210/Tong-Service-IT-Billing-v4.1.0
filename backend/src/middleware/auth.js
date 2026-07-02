const pool = require('../config/db');
const AppError = require('../utils/app-error');
const { verifyToken } = require('../utils/jwt');

async function authenticate(req, _res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) throw new AppError(401, 'กรุณาเข้าสู่ระบบ', 'AUTH_REQUIRED');

        const payload = verifyToken(token);
        const result = await pool.query(
            `SELECT id, name, email, role, active FROM users WHERE id = $1`,
            [payload.sub]
        );
        const user = result.rows[0];
        if (!user || !user.active) {
            throw new AppError(401, 'บัญชีไม่พร้อมใช้งาน', 'ACCOUNT_INACTIVE');
        }
        req.user = user;
        next();
    } catch (error) {
        if (error instanceof AppError) return next(error);
        return next(new AppError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'INVALID_TOKEN'));
    }
}

module.exports = authenticate;
