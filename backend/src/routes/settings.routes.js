const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { settingsSchema } = require('../validators/schemas');

const router = express.Router();

router.get('/public-branding', asyncHandler(async (_req, res) => {
    const result = await pool.query(
        `SELECT shop_name_th, shop_name_en, logo_url
         FROM settings
         WHERE id = 1`
    );

    res.set('Cache-Control', 'no-store');
    res.json({ data: result.rows[0] || null });
}));

router.use(authenticate);

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
            return callback(new AppError(
                400,
                'รองรับเฉพาะไฟล์ PNG, JPG/JPEG และ WebP',
                'INVALID_IMAGE_TYPE'
            ));
        }
        callback(null, true);
    }
});

function hasValidImageSignature(file) {
    const buffer = file.buffer;
    if (file.mimetype === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]));
    }
    if (file.mimetype === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    if (file.mimetype === 'image/webp') {
        return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

function imageDataUrl(file, label) {
    if (!file) throw new AppError(400, `กรุณาเลือกไฟล์${label}`, 'IMAGE_REQUIRED');
    if (!hasValidImageSignature(file)) {
        throw new AppError(400, `เนื้อหาไฟล์${label}ไม่ตรงกับประเภทไฟล์ที่เลือก`, 'INVALID_IMAGE_CONTENT');
    }
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    res.json({ data: result.rows[0] });
}));

router.post('/logo', authorize('admin'), upload.single('logo'), asyncHandler(async (req, res) => {
    const source = imageDataUrl(req.file, 'โลโก้');
    const result = await pool.query(
        'UPDATE settings SET logo_url=$1 WHERE id=1 RETURNING *',
        [source]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ data: result.rows[0] });
}));

router.post('/signature', authorize('admin'), upload.single('signature'), asyncHandler(async (req, res) => {
    const source = imageDataUrl(req.file, 'ลายเซ็น');
    const result = await pool.query(
        'UPDATE settings SET saved_signature_url=$1 WHERE id=1 RETURNING *',
        [source]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ data: result.rows[0] });
}));

router.put('/', authorize('admin'), validate(settingsSchema), asyncHandler(async (req, res) => {
    const b = req.body;
    const result = await pool.query(
        `UPDATE settings SET
          shop_name_th=$1,shop_name_en=$2,shop_owner=$3,shop_address=$4,
          shop_tax_id=$5,shop_phone=$6,shop_email=$7,scb_bank_details=$8,
          ktb_bank_details=$9,logo_url=$10,saved_signature_url=$11,
          numbering_config=$12::jsonb,feature_flags=$13::jsonb
         WHERE id=1 RETURNING *`,
        [b.shop_name_th,b.shop_name_en,b.shop_owner,b.shop_address,b.shop_tax_id,
         b.shop_phone,b.shop_email,b.scb_bank_details,b.ktb_bank_details,b.logo_url,
         b.saved_signature_url,JSON.stringify(b.numbering_config),JSON.stringify(b.feature_flags)]
    );
    res.json({ data: result.rows[0] });
}));

module.exports = router;
