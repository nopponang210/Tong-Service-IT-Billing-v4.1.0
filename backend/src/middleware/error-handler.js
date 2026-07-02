const AppError = require('../utils/app-error');

function notFound(req, _res, next) {
    next(new AppError(404, `ไม่พบเส้นทาง ${req.method} ${req.path}`, 'NOT_FOUND'));
}

function errorHandler(error, _req, res, _next) {
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: { code: 'LOGO_TOO_LARGE', message: 'ไฟล์โลโก้ต้องมีขนาดไม่เกิน 500 KB' } });
    }
    if (error.name === 'MulterError') {
        return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่' } });
    }
    if (error.code === '23505') {
        return res.status(409).json({ error: { code: 'DUPLICATE_DATA', message: 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว' } });
    }
    if (error.code === '23503') {
        return res.status(409).json({ error: { code: 'REFERENCE_CONFLICT', message: 'รายการนี้ถูกใช้งานอยู่ จึงไม่สามารถลบหรือเปลี่ยนได้' } });
    }
    if (error.code === '42703') {
        return res.status(503).json({
            error: {
                code: 'DOCUMENT_SCHEMA_OUTDATED',
                message: 'ฐานข้อมูลยังไม่ตรงกับระบบเวอร์ชันปัจจุบัน กรุณารัน Migration ให้ครบก่อนสร้างเอกสาร'
            }
        });
    }
    if (error.message === 'DISCOUNT_EXCEEDS_SUBTOTAL') {
        return res.status(400).json({ error: { code: 'INVALID_DISCOUNT', message: 'ส่วนลดต้องไม่มากกว่ายอดรวม' } });
    }

    const status = error.statusCode || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
        error: {
            code: error.code || 'INTERNAL_ERROR',
            message: status >= 500 ? 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่' : error.message,
            details: error.details
        }
    });
}

module.exports = { notFound, errorHandler };
