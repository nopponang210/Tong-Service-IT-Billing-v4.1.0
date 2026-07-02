BEGIN;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by BIGINT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by BIGINT,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'documents_cancelled_by_fkey'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_cancelled_by_fkey
            FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'documents_deleted_by_fkey'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_deleted_by_fkey
            FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS documents_active_list_index
    ON documents (document_date DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_deleted_at_index
    ON documents (deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

COMMIT;
