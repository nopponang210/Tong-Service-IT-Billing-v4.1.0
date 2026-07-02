INSERT INTO customers (
  code, name, customer_type, address, withholding_enabled,
  withholding_rate, withholding_basis, withholding_threshold, receipt_transfer_fee
)
VALUES
  ('CUST-GENERAL', 'ลูกค้าทั่วไป', 'general', '-', FALSE, 0, 'none', 0, 0),
  ('CUST-PRIVATE', 'บริษัทตัวอย่าง จำกัด', 'private', 'กรุงเทพมหานคร', TRUE, 3, 'full', 1000, 20),
  ('CUST-GOV', 'หน่วยงานราชการตัวอย่าง', 'government', 'ประเทศไทย', TRUE, 3, 'full', 10000, 0)
ON CONFLICT (code) WHERE code IS NOT NULL DO NOTHING;

INSERT INTO products (sku, name, item_type, unit, price, category)
VALUES
  ('SVC-INSTALL', 'ค่าแรงติดตั้ง', 'service', 'งาน', 1000, 'บริการ'),
  ('SVC-REPAIR', 'ค่าบริการตรวจเช็กและซ่อม', 'service', 'งาน', 500, 'บริการ'),
  ('PRD-LAN-CAT6', 'สาย LAN CAT6', 'product', 'เมตร', 20, 'อุปกรณ์เครือข่าย')
ON CONFLICT (sku) WHERE sku IS NOT NULL DO NOTHING;
