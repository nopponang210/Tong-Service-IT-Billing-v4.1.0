BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'viewer')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(40),
    name VARCHAR(180) NOT NULL,
    customer_type VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (customer_type IN ('general', 'private', 'government')),
    tax_id VARCHAR(30),
    branch_name VARCHAR(120),
    address TEXT,
    email VARCHAR(255),
    phone VARCHAR(40),
    withholding_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    withholding_rate NUMERIC(5,2) NOT NULL DEFAULT 3 CHECK (withholding_rate >= 0 AND withholding_rate <= 100),
    withholding_basis VARCHAR(20) NOT NULL DEFAULT 'full'
        CHECK (withholding_basis IN ('none', 'full', 'service')),
    withholding_threshold NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (withholding_threshold >= 0),
    receipt_transfer_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (receipt_transfer_fee >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_unique ON customers (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_name_index ON customers (name);
CREATE INDEX IF NOT EXISTS customers_type_index ON customers (customer_type);

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(60),
    name VARCHAR(220) NOT NULL,
    item_type VARCHAR(20) NOT NULL DEFAULT 'service'
        CHECK (item_type IN ('product', 'service', 'travel', 'other')),
    unit VARCHAR(50) NOT NULL DEFAULT 'งาน',
    price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    category VARCHAR(120),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_name_index ON products (name);
CREATE INDEX IF NOT EXISTS products_item_type_index ON products (item_type);

CREATE TABLE IF NOT EXISTS settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    shop_name_th VARCHAR(200) NOT NULL DEFAULT 'ต้อง เซอร์วิส ไอที',
    shop_name_en VARCHAR(200) NOT NULL DEFAULT 'Tong Service IT',
    shop_owner VARCHAR(200),
    shop_address TEXT,
    shop_tax_id VARCHAR(30),
    shop_phone VARCHAR(40),
    shop_email VARCHAR(255),
    scb_bank_details TEXT,
    ktb_bank_details TEXT,
    logo_url TEXT,
    saved_signature_url TEXT,
    numbering_config JSONB NOT NULL DEFAULT '{
      "QT":{"prefix":"QT","digits":3,"period":"BYYMM","separator":"-"},
      "IN":{"prefix":"IN","digits":3,"period":"BYYMM","separator":"-"},
      "BN":{"prefix":"BN","digits":3,"period":"BYYMM","separator":"-"},
      "RC":{"prefix":"RC","digits":3,"period":"BYYMM","separator":"-"},
      "DO":{"prefix":"DO","digits":3,"period":"BYYMM","separator":"-"}
    }'::jsonb,
    feature_flags JSONB NOT NULL DEFAULT '{
      "realtime":false,
      "automatic_backup":false,
      "email_notifications":false
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS document_counters (
    document_type VARCHAR(2) NOT NULL CHECK (document_type IN ('QT','IN','BN','RC','DO')),
    period_key VARCHAR(20) NOT NULL,
    last_number INTEGER NOT NULL CHECK (last_number > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_type, period_key)
);

CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    document_number VARCHAR(80) NOT NULL UNIQUE,
    document_type VARCHAR(2) NOT NULL CHECK (document_type IN ('QT','IN','BN','RC','DO')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('DRAFT','PENDING','APPROVED','PAID','CANCELLED','OVERDUE')),
    document_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_snapshot JSONB NOT NULL,
    product_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (product_subtotal >= 0),
    service_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (service_subtotal >= 0),
    other_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_subtotal >= 0),
    subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    grand_total NUMERIC(14,2) NOT NULL CHECK (grand_total >= 0),
    withholding_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (withholding_rate >= 0 AND withholding_rate <= 100),
    withholding_base NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (withholding_base >= 0),
    withholding_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0),
    transfer_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
    net_total NUMERIC(14,2) NOT NULL CHECK (net_total >= 0),
    remarks TEXT,
    payment_terms TEXT,
    delivery_days INTEGER CHECK (delivery_days IS NULL OR delivery_days >= 0),
    quotation_validity_days INTEGER CHECK (quotation_validity_days IS NULL OR quotation_validity_days >= 0),
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (due_date IS NULL OR due_date >= document_date)
);
CREATE INDEX IF NOT EXISTS documents_type_index ON documents (document_type);
CREATE INDEX IF NOT EXISTS documents_status_index ON documents (status);
CREATE INDEX IF NOT EXISTS documents_date_index ON documents (document_date DESC);
CREATE INDEX IF NOT EXISTS documents_customer_index ON documents (customer_id);

CREATE TABLE IF NOT EXISTS document_items (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    line_type VARCHAR(20) NOT NULL DEFAULT 'item'
        CHECK (line_type IN ('section', 'item', 'note')),
    item_type VARCHAR(20) CHECK (item_type IN ('product', 'service', 'travel', 'other')),
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(12,2),
    unit VARCHAR(50),
    unit_price NUMERIC(14,2),
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
    text_style VARCHAR(20) NOT NULL DEFAULT 'normal'
        CHECK (text_style IN ('normal', 'bold', 'warning')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (line_type = 'item' AND quantity IS NOT NULL AND quantity > 0 AND unit_price IS NOT NULL AND unit_price >= 0 AND item_type IS NOT NULL)
      OR (line_type IN ('section','note'))
    )
);
CREATE INDEX IF NOT EXISTS document_items_document_index ON document_items (document_id, sort_order);

CREATE TABLE IF NOT EXISTS document_relations (
    id BIGSERIAL PRIMARY KEY,
    source_document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relation_type VARCHAR(30) NOT NULL
        CHECK (relation_type IN ('CONVERTED_TO','INCLUDED_IN','PAID_BY')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_document_id, target_document_id, relation_type),
    CHECK (source_document_id <> target_document_id)
);
CREATE INDEX IF NOT EXISTS document_relations_source_index ON document_relations (source_document_id);
CREATE INDEX IF NOT EXISTS document_relations_target_index ON document_relations (target_document_id);

CREATE TABLE IF NOT EXISTS document_signatures (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    role VARCHAR(40) NOT NULL,
    signer_name VARCHAR(200),
    signature_url TEXT,
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS document_signatures_document_index ON document_signatures (document_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_index ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_index ON audit_logs (created_at DESC);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS settings_set_updated_at ON settings;
CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Data API is not used by the frontend. RLS remains enabled as a defense-in-depth measure.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
