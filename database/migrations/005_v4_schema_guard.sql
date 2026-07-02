BEGIN;

-- v4 schema guard: safe to run after any v3.x installation.
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS withholding_is_actual BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_received_date DATE,
    ADD COLUMN IF NOT EXISTS withholding_certificate_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS withholding_certificate_date DATE;

ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE documents
    ADD CONSTRAINT documents_status_check
    CHECK (
        status IN (
            'DRAFT',
            'PENDING',
            'APPROVED',
            'IN_PROGRESS',
            'REJECTED',
            'PAID',
            'CANCELLED',
            'OVERDUE'
        )
    );

CREATE INDEX IF NOT EXISTS documents_payment_received_date_index
    ON documents (payment_received_date DESC)
    WHERE payment_received_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_withholding_certificate_index
    ON documents (withholding_certificate_number)
    WHERE withholding_certificate_number IS NOT NULL;

UPDATE documents
SET
    withholding_is_actual = TRUE,
    payment_received_date = COALESCE(payment_received_date, document_date)
WHERE document_type = 'RC';


COMMIT;
