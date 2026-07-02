export const DOC_LABELS = { QT:'ใบเสนอราคา', IN:'ใบแจ้งหนี้', BN:'ใบวางบิล', RC:'ใบเสร็จรับเงิน', DO:'ใบส่งของ / ส่งมอบงาน' };
export const STATUS_LABELS = { DRAFT:'แบบร่าง', PENDING:'รอดำเนินการ', APPROVED:'อนุมัติแล้ว', IN_PROGRESS:'กำลังดำเนินงาน', REJECTED:'ลูกค้าไม่อนุมัติ', PAID:'ชำระแล้ว', OVERDUE:'เกินกำหนด', CANCELLED:'ยกเลิก' };
export const CUSTOMER_TYPE_LABELS = { general:'บุคคลทั่วไป', private:'บริษัทเอกชน', government:'หน่วยงานราชการ' };
export const ITEM_TYPE_LABELS = { product:'สินค้า/อะไหล่', service:'ค่าแรง/บริการ', travel:'ค่าเดินทาง', other:'อื่น ๆ' };
export const ROLE_LABELS = { admin:'ผู้ดูแลระบบ', staff:'พนักงาน', viewer:'ผู้ตรวจสอบ' };

export function documentStatusLabel(status, documentType) {
  if (status === 'PENDING') {
    if (documentType === 'QT') return 'รอลูกค้าตัดสินใจ';
    if (documentType === 'DO') return 'ส่งมอบแล้ว / รอชำระ';
    if (documentType === 'IN' || documentType === 'BN') return 'รอชำระ';
    if (documentType === 'RC') return 'ออกใบเสร็จแล้ว';
  }
  return STATUS_LABELS[status] || status;
}

export function money(value) {
  return new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', minimumFractionDigits:2 }).format(Number(value || 0));
}
export function number(value) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value || 0));
}
function parseDateValue(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  // PostgreSQL DATE usually arrives as YYYY-MM-DD. Parse it in local time
  // to avoid a timezone shift, while ISO timestamps can be parsed directly.
  let parsed;
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  } else {
    parsed = new Date(text);
  }

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function dateThai(value, long = false) {
  const parsed = parseDateValue(value);
  if (!parsed) return '-';

  return new Intl.DateTimeFormat(
    'th-TH-u-ca-buddhist',
    long
      ? { day:'numeric', month:'long', year:'numeric' }
      : { day:'2-digit', month:'2-digit', year:'numeric' }
  ).format(parsed);
}
export function today() { return new Date().toISOString().slice(0,10); }
export function currentMonth() { return new Date().toISOString().slice(0,7); }
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
export function initials(name) {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).map((p) => p[0]).join('').toUpperCase();
}


export function validatePublicImageUrl(value, label = 'รูปภาพ') {
  const text = String(value || '').trim();
  if (!text) return '';

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return `${label}: URL ไม่ถูกต้อง กรุณาใส่ลิงก์เต็ม เช่น https://example.com/logo.png`;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return `${label}: รองรับเฉพาะ URL ที่ขึ้นต้นด้วย http:// หรือ https://`;
  }

  if (location.protocol === 'https:' && parsed.protocol !== 'https:') {
    return `${label}: เว็บไซต์ใช้งานผ่าน HTTPS จึงต้องใช้ URL รูปภาพแบบ https://`;
  }

  return '';
}

export function testPublicImageUrl(value, timeoutMs = 10000) {
  const url = String(value || '').trim();
  if (!url) return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const done = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    image.referrerPolicy = 'no-referrer';
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = url;
  });
}

export function setImageSource(image, url, fallback = './assets/logo-placeholder.svg') {
  if (!image) return;
  const source = String(url || '').trim();
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
    image.dataset.imageState = 'error';
  };
  image.onload = () => {
    image.dataset.imageState = source ? 'loaded' : 'fallback';
  };
  image.src = source || fallback;
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

const THAI_NUM = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readSixDigits(num) {
  const s = String(num).padStart(6,'0');
  let out = '';
  for (let i=0;i<6;i++) {
    const digit = Number(s[i]);
    if (!digit) continue;
    const pos = 5-i;
    if (pos === 1 && digit === 1) out += '';
    else if (pos === 1 && digit === 2) out += 'ยี่';
    else if (pos === 0 && digit === 1 && out) out += 'เอ็ด';
    else out += THAI_NUM[digit];
    out += THAI_POS[pos];
  }
  return out;
}
function readInteger(num) {
  if (num === 0) return 'ศูนย์';
  const groups = [];
  let n = num;
  while (n > 0) { groups.unshift(n % 1_000_000); n = Math.floor(n / 1_000_000); }
  return groups.map((g, i) => {
    const text = readSixDigits(g);
    const millionCount = groups.length - i - 1;
    return text + 'ล้าน'.repeat(millionCount);
  }).join('');
}
export function thaiBahtText(value) {
  const amount = Math.round(Number(value || 0) * 100);
  const baht = Math.floor(amount / 100);
  const satang = amount % 100;
  return `${readInteger(baht)}บาท${satang === 0 ? 'ถ้วน' : `${readInteger(satang)}สตางค์`}`;
}
