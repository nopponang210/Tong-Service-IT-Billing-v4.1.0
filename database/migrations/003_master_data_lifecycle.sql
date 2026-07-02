BEGIN;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deactivated_by BIGINT,
    ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deactivated_by BIGINT,
    ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'customers_deactivated_by_fkey'
    ) THEN
        ALTER TABLE customers
            ADD CONSTRAINT customers_deactivated_by_fkey
            FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_deactivated_by_fkey'
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT products_deactivated_by_fkey
            FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customers_active_name_index
    ON customers (name)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS customers_inactive_index
    ON customers (deactivated_at DESC)
    WHERE active = FALSE;

CREATE INDEX IF NOT EXISTS products_active_name_index
    ON products (name)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS products_inactive_index
    ON products (deactivated_at DESC)
    WHERE active = FALSE;

COMMIT;
