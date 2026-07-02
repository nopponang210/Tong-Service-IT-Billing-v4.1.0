BEGIN;

-- ลายเซ็นเป็นตัวเลือกต่อเอกสาร
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS show_signature
        BOOLEAN NOT NULL DEFAULT FALSE;

-- รักษาพฤติกรรมเอกสารเก่าที่มี Snapshot ลายเซ็นอยู่แล้ว
UPDATE documents d
SET show_signature = TRUE
WHERE EXISTS (
    SELECT 1
    FROM document_signatures ds
    WHERE ds.document_id = d.id
      AND ds.role = 'issuer'
      AND NULLIF(ds.signature_url, '') IS NOT NULL
);

-- เอกสารที่ไม่ใช่ใบเสร็จต้องแสดงยอดเต็ม และไม่คิดภาษีหัก ณ ที่จ่าย
UPDATE documents
SET
    withholding_rate = 0,
    withholding_base = 0,
    withholding_amount = 0,
    withholding_is_actual = FALSE,
    transfer_fee = 0,
    net_total = grand_total
WHERE document_type <> 'RC';

COMMIT;
