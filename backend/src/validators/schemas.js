const { z } = require('zod');

const optionalText = (max) => z.union([z.string().trim().max(max), z.literal(''), z.null()]).optional().transform((v) => v || null);

const optionalImageSource = (label) => z
    .union([z.string().trim().max(1_500_000), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null)
    .refine((value) => {
        if (!value) return true;
        if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return true;
        try {
            const parsed = new URL(value);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }, { message: `${label} ต้องเป็นไฟล์ PNG, JPG/JPEG, WebP ที่อัปโหลดจากระบบ หรือ URL แบบ http:// / https://` });

const decimalInput = z.union([
    z.number().finite().nonnegative(),
    z.string().trim().regex(/^\d+(\.\d{1,2})?$/)
]);
const positiveDecimalInput = z.union([
    z.number().finite().positive(),
    z.string().trim().regex(/^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/)
]);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const passwordSchema = z
    .string({ error: 'กรุณากรอกรหัสผ่าน' })
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(72, 'รหัสผ่านต้องไม่เกิน 72 ตัวอักษร')
    .regex(/^[\x21-\x7E]+$/, 'รหัสผ่านต้องใช้เฉพาะภาษาอังกฤษ ตัวเลข และอักขระพิเศษ โดยห้ามมีช่องว่าง')
    .regex(/[A-Z]/, 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่อย่างน้อย 1 ตัว')
    .regex(/[a-z]/, 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็กอย่างน้อย 1 ตัว')
    .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว')
    .regex(/[^A-Za-z0-9]/, 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว');

const loginSchema = z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(200)
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const paginationSchema = z.object({
    search: z.string().trim().max(200).default(''),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50)
});

const masterDataListSchema = paginationSchema.extend({
    status: z.enum(['active', 'inactive', 'all']).default('active')
});

const customerSchema = z.object({
    code: optionalText(40),
    name: z.string().trim().min(1).max(180),
    customer_type: z.enum(['general', 'private', 'government']),
    tax_id: optionalText(30),
    branch_name: optionalText(120),
    address: optionalText(3000),
    email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional().transform((v) => v || null),
    phone: optionalText(40),
    withholding_enabled: z.boolean().default(false),
    withholding_rate: decimalInput.default(3),
    withholding_basis: z.enum(['none', 'full', 'service']).default('full'),
    withholding_threshold: decimalInput.default(0),
    receipt_transfer_fee: decimalInput.default(0)
});

const productSchema = z.object({
    sku: optionalText(60),
    name: z.string().trim().min(1).max(220),
    item_type: z.enum(['product', 'service', 'travel', 'other']),
    unit: z.string().trim().min(1).max(50),
    price: decimalInput,
    category: optionalText(120)
});

const documentItemSchema = z.object({
    line_type: z.enum(['section', 'item', 'note']).default('item'),
    item_type: z.enum(['product', 'service', 'travel', 'other']).nullable().optional(),
    product_id: z.coerce.number().int().positive().nullable().optional(),
    description: z.string().trim().min(1).max(2000),
    quantity: positiveDecimalInput.nullable().optional(),
    unit: optionalText(50),
    unit_price: decimalInput.nullable().optional(),
    text_style: z.enum(['normal', 'bold', 'warning']).default('normal')
}).superRefine((item, ctx) => {
    if (item.line_type === 'item') {
        if (!item.item_type) ctx.addIssue({ code: 'custom', path: ['item_type'], message: 'กรุณาเลือกประเภทรายการ' });
        if (item.quantity == null) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'กรุณาระบุจำนวน' });
        if (item.unit_price == null) ctx.addIssue({ code: 'custom', path: ['unit_price'], message: 'กรุณาระบุราคา' });
    }
});

const documentCreateSchema = z.object({
    document_type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']),
    document_date: dateInput,
    due_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    customer_id: z.coerce.number().int().positive(),
    discount: decimalInput.default(0),
    remarks: optionalText(5000),
    payment_terms: optionalText(1000),
    delivery_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    quotation_validity_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    receipt_withholding_enabled: z.boolean().optional(),
    receipt_withholding_rate: decimalInput.optional(),
    receipt_withholding_amount: decimalInput.optional(),
    receipt_transfer_fee: decimalInput.optional(),
    payment_received_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    withholding_certificate_number: optionalText(120),
    withholding_certificate_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    show_signature: z.boolean().default(false),
    source_document_ids: z.array(z.coerce.number().int().positive()).max(100).default([]),
    items: z.array(documentItemSchema).max(200).default([])
}).superRefine((data, ctx) => {
    if (data.due_date && data.due_date < data.document_date) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร' });
    }
    if (data.items.length === 0 && data.source_document_ids.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'ต้องมีรายการหรือเอกสารต้นทางอย่างน้อยหนึ่งรายการ' });
    }
    if (data.document_type === 'QT' && data.source_document_ids.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['source_document_ids'], message: 'ใบเสนอราคาไม่ต้องมีเอกสารต้นทาง' });
    }
    if (data.document_type === 'BN' && data.source_document_ids.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['source_document_ids'], message: 'ใบวางบิลต้องเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ' });
    }
    if (data.document_type !== 'BN' && data.source_document_ids.length > 1) {
        ctx.addIssue({ code: 'custom', path: ['source_document_ids'], message: 'เอกสารประเภทนี้เลือกเอกสารต้นทางได้เพียง 1 ใบ' });
    }
});

const documentUpdateSchema = z.object({
    document_type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']),
    document_date: dateInput,
    due_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    customer_id: z.coerce.number().int().positive(),
    discount: decimalInput.default(0),
    remarks: optionalText(5000),
    payment_terms: optionalText(1000),
    delivery_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    quotation_validity_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    receipt_withholding_enabled: z.boolean().optional(),
    receipt_withholding_rate: decimalInput.optional(),
    receipt_withholding_amount: decimalInput.optional(),
    receipt_transfer_fee: decimalInput.optional(),
    payment_received_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    withholding_certificate_number: optionalText(120),
    withholding_certificate_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    show_signature: z.boolean().default(false),
    items: z.array(documentItemSchema).min(1, 'กรุณาเพิ่มรายการสินค้า/บริการ').max(200)
}).superRefine((data, ctx) => {
    if (data.due_date && data.due_date < data.document_date) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร' });
    }
});

const documentListSchema = paginationSchema.extend({
    type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']).optional(),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'REJECTED', 'PAID', 'CANCELLED', 'OVERDUE']).optional(),
    customer_id: z.coerce.number().int().positive().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    deleted_only: z.enum(['true', 'false']).optional().transform((value) => value === 'true')
});

const documentStatusSchema = z.object({
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'REJECTED', 'PAID', 'CANCELLED', 'OVERDUE'])
});

const documentReasonSchema = z.object({
    reason: z.string().trim().min(3, 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร').max(1000)
});

const sourceQuerySchema = z.object({
    target_type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']),
    customer_id: z.coerce.number().int().positive()
});

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

const settingsSchema = z.object({
    shop_name_th: z.string().trim().min(1).max(200),
    shop_name_en: z.string().trim().min(1).max(200),
    shop_owner: optionalText(200),
    shop_address: optionalText(3000),
    shop_tax_id: optionalText(30),
    shop_phone: optionalText(40),
    shop_email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional().transform((v) => v || null),
    scb_bank_details: optionalText(2000),
    ktb_bank_details: optionalText(2000),
    logo_url: optionalImageSource('โลโก้'),
    saved_signature_url: optionalImageSource('ลายเซ็น'),
    numbering_config: z.record(z.string(), z.object({
        prefix: z.string().max(10),
        digits: z.coerce.number().int().min(1).max(8),
        period: z.enum(['BYYMM', 'BYY', 'MMBYY', 'NONE']),
        separator: z.string().max(3)
    })),
    feature_flags: z.object({
        realtime: z.boolean().default(false),
        automatic_backup: z.boolean().default(false),
        email_notifications: z.boolean().default(false)
    })
});

const userCreateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: passwordSchema,
    role: z.enum(['admin', 'staff', 'viewer'])
});

const userPasswordResetSchema = z.object({
    password: passwordSchema
});

module.exports = {
    loginSchema, idSchema, paginationSchema, masterDataListSchema, customerSchema, productSchema,
    documentCreateSchema, documentUpdateSchema, documentListSchema, documentStatusSchema,
    documentReasonSchema, sourceQuerySchema, monthSchema, settingsSchema, userCreateSchema,
    passwordSchema, userPasswordResetSchema
};
