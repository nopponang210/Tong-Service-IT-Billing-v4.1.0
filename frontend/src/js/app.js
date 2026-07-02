import { request, getToken, clearToken, API_BASE_URL } from './api.js';
import { initTheme } from './theme.js';
import {
  DOC_LABELS, STATUS_LABELS, CUSTOMER_TYPE_LABELS, ITEM_TYPE_LABELS, documentStatusLabel,
  ROLE_LABELS, money, dateThai, today, currentMonth, escapeHtml,
  initials, debounce, setImageSource
} from './utils.js';

initTheme();

if (!getToken()) location.replace('./index.html');

const state = {
  user: null,
  settings: null,
  customers: [],
  products: [],
  currentView: 'dashboard',
  dashboardAnalytics: null,
  reportChartData: null,
  editingDocumentId: null,
  documentWizardStep: 1,
  documentsTrashMode: false,
  customerStatus: 'active',
  productStatus: 'active'
};
const chartInstances = new Map();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function getPasswordRequirements(password) {
  const value = String(password || '');
  return {
    length: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
    allowed: /^[\x21-\x7E]*$/.test(value)
  };
}

function validatePassword(password) {
  const value = String(password || '');
  if (!value) return 'กรุณากรอกรหัสผ่าน';
  if (value.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  if (value.length > 72) return 'รหัสผ่านต้องไม่เกิน 72 ตัวอักษร';
  if (!/^[\x21-\x7E]+$/.test(value)) return 'รหัสผ่านต้องใช้เฉพาะภาษาอังกฤษ ตัวเลข และอักขระพิเศษ โดยห้ามมีช่องว่าง';
  if (!/[A-Z]/.test(value)) return 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่อย่างน้อย 1 ตัว';
  if (!/[a-z]/.test(value)) return 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็กอย่างน้อย 1 ตัว';
  if (!/[0-9]/.test(value)) return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';
  if (!/[^A-Za-z0-9]/.test(value)) return 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว';
  return '';
}

function renderPasswordRequirements(password, markInvalid = false) {
  const rules = getPasswordRequirements(password);
  Object.entries(rules).forEach(([rule, valid]) => {
    const item = document.querySelector(`[data-rule="${rule}"]`);
    if (!item) return;
    item.classList.toggle('is-valid', valid);
    item.classList.toggle('is-invalid', markInvalid && !valid);
  });
  return rules;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function cssValue(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartTheme() {
  return {
    text: cssValue('--text-soft') || '#64748b',
    muted: cssValue('--muted') || '#94a3b8',
    border: cssValue('--border') || '#cbd5e1',
    surface: cssValue('--surface') || '#ffffff'
  };
}

function destroyChart(id) {
  const chart = chartInstances.get(id);
  if (chart) chart.destroy();
  chartInstances.delete(id);
}

function setChartEmpty(id, empty) {
  const canvas = document.getElementById(id);
  const emptyState = document.querySelector(`[data-chart-empty="${id}"]`);
  if (canvas) canvas.classList.toggle('hidden', empty);
  if (emptyState) emptyState.classList.toggle('hidden', !empty);
}

function createChart(id, configuration, hasData = true) {
  destroyChart(id);
  if (!window.Chart) {
    const emptyState = document.querySelector(`[data-chart-empty="${id}"]`);
    if (emptyState) emptyState.textContent = 'โหลดระบบกราฟไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า';
    setChartEmpty(id, true);
    return null;
  }
  setChartEmpty(id, !hasData);
  if (!hasData) return null;
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const chart = new window.Chart(canvas, configuration);
  chartInstances.set(id, chart);
  return chart;
}

function monthLabel(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return value || '-';
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}

function baseChartOptions({ horizontal = false, showLegend = true, moneyAxis = true } = {}) {
  const theme = chartTheme();
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: theme.text, usePointStyle: true, boxWidth: 9, padding: 16 }
      },
      tooltip: {
        callbacks: moneyAxis ? {
          label(context) {
            const label = context.dataset.label ? `${context.dataset.label}: ` : '';
            return `${label}${money(context.parsed[horizontal ? 'x' : 'y'] ?? context.raw)}`;
          }
        } : undefined
      }
    },
    scales: {
      x: {
        grid: { color: horizontal ? 'transparent' : theme.border },
        ticks: {
          color: theme.muted,
          callback: horizontal && moneyAxis ? (value) => new Intl.NumberFormat('th-TH', { notation: 'compact' }).format(value) : undefined
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: horizontal ? theme.border : theme.border },
        ticks: {
          color: theme.muted,
          callback: !horizontal && moneyAxis ? (value) => new Intl.NumberFormat('th-TH', { notation: 'compact' }).format(value) : undefined
        }
      }
    }
  };
}

function renderDashboardCharts(analytics = state.dashboardAnalytics) {
  if (!analytics) return;
  state.dashboardAnalytics = analytics;
  const trend = analytics.revenue_trend || [];
  const trendHasData = trend.some((row) => Number(row.received_total) > 0 || Number(row.product_total) > 0 || Number(row.service_total) > 0);
  createChart('revenue-trend-chart', {
    type: 'line',
    data: {
      labels: trend.map((row) => monthLabel(row.month)),
      datasets: [
        { label: 'สินค้า/อะไหล่', data: trend.map((row) => Number(row.product_total)), borderColor: '#4f8dd6', backgroundColor: 'rgba(79,141,214,.14)', tension: .28, fill: false },
        { label: 'ค่าแรง/บริการ', data: trend.map((row) => Number(row.service_total)), borderColor: '#8b68c8', backgroundColor: 'rgba(139,104,200,.14)', tension: .28, fill: false },
        { label: 'ยอดรับสุทธิ', data: trend.map((row) => Number(row.received_total)), borderColor: '#36a269', backgroundColor: 'rgba(54,162,105,.12)', tension: .28, borderWidth: 3, fill: true }
      ]
    },
    options: baseChartOptions()
  }, trendHasData);

  const mix = analytics.revenue_mix || {};
  const mixValues = [Number(mix.product_total || 0), Number(mix.service_total || 0), Number(mix.other_total || 0)];
  createChart('revenue-mix-chart', {
    type: 'doughnut',
    data: {
      labels: ['สินค้า/อะไหล่', 'ค่าแรง/บริการ', 'อื่น ๆ'],
      datasets: [{ data: mixValues, backgroundColor: ['#4f8dd6','#8b68c8','#d8842f'], borderWidth: 2, borderColor: chartTheme().surface }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '64%',
      plugins: {
        legend: { position: 'bottom', labels: { color: chartTheme().text, usePointStyle: true, padding: 15 } },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${money(context.raw)}` } }
      }
    }
  }, mixValues.some((value) => value > 0));

  const aging = analytics.receivables_aging || [];
  const agingMap = Object.fromEntries(aging.map((row) => [row.bucket, Number(row.total || 0)]));
  const agingValues = [agingMap.not_due || 0, agingMap.days_1_30 || 0, agingMap.days_31_60 || 0, agingMap.days_61_plus || 0];
  createChart('receivables-aging-chart', {
    type: 'bar',
    data: {
      labels: ['ยังไม่ครบกำหนด', 'เกิน 1–30 วัน', 'เกิน 31–60 วัน', 'เกิน 61 วัน'],
      datasets: [{ label: 'ยอดลูกหนี้', data: agingValues, backgroundColor: ['#4f8dd6','#e0a12f','#d8842f','#d65353'], borderRadius: 8 }]
    },
    options: baseChartOptions({ showLegend: false })
  }, agingValues.some((value) => value > 0));

  const topCustomers = analytics.top_customers || [];
  createChart('top-customers-chart', {
    type: 'bar',
    data: {
      labels: topCustomers.map((row) => row.name),
      datasets: [{ label: 'ยอดรับสุทธิ', data: topCustomers.map((row) => Number(row.total)), backgroundColor: '#36a269', borderRadius: 8 }]
    },
    options: baseChartOptions({ horizontal: true, showLegend: false })
  }, topCustomers.some((row) => Number(row.total) > 0));

  const topServices = analytics.top_services || [];
  createChart('top-services-chart', {
    type: 'bar',
    data: {
      labels: topServices.map((row) => row.description),
      datasets: [{ label: 'รายได้จากบริการ', data: topServices.map((row) => Number(row.total)), backgroundColor: '#8b68c8', borderRadius: 8 }]
    },
    options: baseChartOptions({ horizontal: true, showLegend: false })
  }, topServices.some((row) => Number(row.total) > 0));

  const insights = analytics.insights || {};
  $('#insight-receipt-count').textContent = `${Number(insights.receipt_count || 0).toLocaleString('th-TH')} ฉบับ`;
  $('#insight-average-receipt').textContent = money(insights.average_receipt || 0);
  $('#insight-conversion-rate').textContent = `${Number(insights.quotation_conversion_rate || 0).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;
  $('#insight-top-customer').textContent = insights.top_customer || '-';
}

function renderReportCharts(data = state.reportChartData) {
  if (!data) return;
  state.reportChartData = data;
  const summary = data.summary || {};
  const mixValues = [Number(summary.product_total || 0), Number(summary.service_total || 0), Math.max(0, Number(summary.gross_total || 0) - Number(summary.product_total || 0) - Number(summary.service_total || 0))];
  createChart('report-mix-chart', {
    type: 'doughnut',
    data: { labels: ['สินค้า/อะไหล่','ค่าแรง/บริการ','อื่น ๆ'], datasets: [{ data: mixValues, backgroundColor: ['#4f8dd6','#8b68c8','#d8842f'], borderWidth: 2, borderColor: chartTheme().surface }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: chartTheme().text, usePointStyle: true } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${money(context.raw)}` } } } }
  }, mixValues.some((value) => value > 0));

  const counts = Object.fromEntries((data.by_type || []).map((row) => [row.document_type, Number(row.count || 0)]));
  const docValues = ['QT','IN','BN','RC','DO'].map((type) => counts[type] || 0);
  createChart('report-document-chart', {
    type: 'bar',
    data: { labels: ['ใบเสนอราคา','ใบแจ้งหนี้','ใบวางบิล','ใบเสร็จ','ใบส่งของ / ใบส่งมอบงาน'], datasets: [{ label: 'จำนวนเอกสาร', data: docValues, backgroundColor: ['#4f8dd6','#d5a13b','#8b68c8','#36a269','#3b9fa3'], borderRadius: 7 }] },
    options: baseChartOptions({ showLegend: false, moneyAxis: false })
  }, docValues.some((value) => value > 0));
}
function dateTimeThai(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }).format(parsed);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}
function showGlobalError(error) {
  const box = $('#global-alert');
  box.textContent = error.message || String(error);
  box.className = 'alert alert-danger';
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 7000);
}
function setBusy(button, busy, busyText = 'กำลังบันทึก...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
    refreshIcons();
  }
}

const viewMeta = {
  dashboard: ['แดชบอร์ดควบคุม', 'ภาพรวมรายได้ เอกสาร และงานค้าง'],
  documents: ['คลังเอกสาร', 'จัดการใบเสนอราคา ใบแจ้งหนี้ ใบวางบิล ใบเสร็จ และใบส่งของ / ใบส่งมอบงาน'],
  customers: ['รายชื่อลูกค้า', 'ข้อมูลลูกค้าและกฎการหัก ณ ที่จ่าย'],
  products: ['สินค้าและบริการ', 'คลังรายการมาตรฐาน ค่าแรง อะไหล่ และค่าใช้จ่าย'],
  reports: ['รายงานการเงิน', 'สรุปรายได้สินค้า ค่าแรง ภาษี และยอดรับสุทธิ'],
  settings: ['ตั้งค่าระบบ', 'ข้อมูลร้าน การรับชำระเงิน รูปแบบเอกสาร และผู้ใช้งาน']
};

async function switchView(name) {
  if (name === 'settings' && state.user?.role !== 'admin') return;
  state.currentView = name;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${name}`));
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === name));
  $('#page-title').textContent = viewMeta[name][0];
  $('#page-subtitle').textContent = viewMeta[name][1];
  $('#sidebar').classList.remove('open');
  $('#user-menu').classList.add('hidden');

  try {
    if (name === 'dashboard') await loadDashboard();
    if (name === 'documents') await loadDocuments();
    if (name === 'customers') await loadCustomers();
    if (name === 'products') await loadProducts();
    if (name === 'reports') await loadReport();
    if (name === 'settings') await Promise.all([loadSettings(), loadUsers()]);
  } catch (error) { showGlobalError(error); }
}

function applyRole() {
  const isAdmin = state.user.role === 'admin';
  const canWrite = ['admin', 'staff'].includes(state.user.role);
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin));
  $$('.writer-only').forEach((el) => el.classList.toggle('hidden', !canWrite));
  $('#current-user-name').textContent = state.user.name;
  $('#current-user-role').textContent = ROLE_LABELS[state.user.role];
  $('#user-avatar').textContent = initials(state.user.name);
}

async function loadInitialData() {
  const [me, settings, customers, products] = await Promise.all([
    request('/auth/me'),
    request('/settings'),
    request('/customers?limit=200&page=1'),
    request('/products?limit=200&page=1')
  ]);
  state.user = me.user;
  state.settings = settings.data;
  state.customers = customers.data;
  state.products = products.data;
  applyRole();
  applyBrand();
  updateSignatureOptionAvailability();
  renderCustomerOptions();
  ensureProductDatalist();
  await loadDashboard();
}

function applyBrand() {
  $('#sidebar-shop-name').textContent = state.settings?.shop_name_en || state.settings?.shop_name_th || 'Tong Service IT';
  setImageSource($('#sidebar-logo'), state.settings?.logo_url);
}

function updateSignatureOptionAvailability() {
  const checkbox = $('#doc-show-signature');
  const help = $('#doc-signature-help');
  if (!checkbox || !help) return;

  const available = Boolean(state.settings?.saved_signature_url);
  checkbox.disabled = !available;

  if (!available) {
    checkbox.checked = false;
    help.textContent = 'ยังไม่มีลายเซ็นในระบบ กรุณาอัปโหลดในหน้าตั้งค่าก่อน';
    return;
  }

  help.textContent = checkbox.checked
    ? 'เอกสารนี้จะแสดง Snapshot ลายเซ็นที่บันทึกไว้'
    : 'เลือกเป็นรายเอกสาร หรือเว้นไว้สำหรับเซ็นด้วยมือ';
}

function imageControls(type) {
  const isLogo = type === 'logo';
  return {
    label: isLogo ? 'โลโก้' : 'ลายเซ็น',
    fileInput: $(isLogo ? '#setting-logo-file' : '#setting-signature-file'),
    sourceInput: $(isLogo ? '#setting-logo-url' : '#setting-signature-url'),
    preview: $(isLogo ? '#setting-logo-preview' : '#setting-signature-preview'),
    status: $(isLogo ? '#setting-logo-status' : '#setting-signature-status'),
    fieldName: isLogo ? 'logo' : 'signature',
    endpoint: isLogo ? '/settings/logo' : '/settings/signature'
  };
}

function setStoredImageState(type, source) {
  const controls = imageControls(type);
  controls.sourceInput.value = source || '';
  controls.fileInput.value = '';
  setImageSource(controls.preview, source || '');
  controls.status.className = 'image-url-status';
  controls.status.textContent = source
    ? `มี${controls.label}ในระบบแล้ว`
    : `ยังไม่ได้อัปโหลด${controls.label}`;
  if (source) controls.status.classList.add('is-success');
}

function handleImageFileChange(type, event) {
  const controls = imageControls(type);
  const file = event.currentTarget.files?.[0];
  controls.status.className = 'image-url-status';
  if (!file) {
    setImageSource(controls.preview, controls.sourceInput.value);
    controls.status.textContent = controls.sourceInput.value
      ? `มี${controls.label}ในระบบแล้ว`
      : 'ยังไม่ได้เลือกไฟล์';
    return;
  }
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    event.currentTarget.value = '';
    controls.status.textContent = 'รองรับเฉพาะไฟล์ PNG, JPG/JPEG และ WebP';
    controls.status.classList.add('is-error');
    return;
  }
  if (file.size > 500 * 1024) {
    event.currentTarget.value = '';
    controls.status.textContent = `ไฟล์${controls.label}ต้องมีขนาดไม่เกิน 500 KB`;
    controls.status.classList.add('is-error');
    return;
  }
  const previewUrl = URL.createObjectURL(file);
  controls.preview.onload = () => URL.revokeObjectURL(previewUrl);
  controls.preview.src = previewUrl;
  controls.status.textContent = `พร้อมอัปโหลด: ${file.name} (${Math.ceil(file.size / 1024)} KB)`;
  controls.status.classList.add('is-success');
}

function removeStoredImage(type) {
  const controls = imageControls(type);
  controls.fileInput.value = '';
  controls.sourceInput.value = '';
  setImageSource(controls.preview, '');
  controls.status.className = 'image-url-status';
  controls.status.textContent = `${controls.label}จะถูกลบเมื่อกดบันทึกการตั้งค่า`;
}

async function uploadSelectedImage(type) {
  const controls = imageControls(type);
  const file = controls.fileInput.files?.[0];
  if (!file) return controls.sourceInput.value;
  const formData = new FormData();
  formData.append(controls.fieldName, file);
  const result = await request(controls.endpoint, { method: 'POST', body: formData });
  state.settings = result.data;
  const source = type === 'logo' ? result.data.logo_url : result.data.saved_signature_url;
  setStoredImageState(type, source || '');
  controls.status.textContent = `อัปโหลด${controls.label}สำเร็จ`;
  return source || '';
}

async function loadDashboard() {
  const months = Number($('#dashboard-period')?.value || 6);
  const result = await request(`/dashboard?months=${months}`);
  $('#stat-income').textContent = money(result.stats.monthly_income);
  $('#stat-outstanding').textContent = money(result.stats.outstanding);
  $('#stat-withholding').textContent = money(result.stats.yearly_withholding);
  $('#stat-fee').textContent = money(result.stats.yearly_transfer_fee);

  const overdue = $('#overdue-list');
  if (!result.overdue.length) {
    overdue.className = 'empty-state';
    overdue.innerHTML = '<i data-lucide="badge-check"></i><strong>ไม่มีงานค้าง</strong><span>เอกสารทั้งหมดอยู่ในสถานะปกติ</span>';
  } else {
    overdue.className = '';
    overdue.innerHTML = result.overdue.map((doc) => `
      <div class="overdue-item"><div><strong>${escapeHtml(doc.document_number)}</strong><div>${escapeHtml(doc.customer_name)}</div></div><div><small>ครบกำหนด ${dateThai(doc.due_date)}</small><strong>${money(doc.grand_total)}</strong></div></div>
    `).join('');
  }

  const recent = $('#recent-documents');
  recent.innerHTML = result.recent.length ? result.recent.map((doc) => `
    <tr><td><strong>${escapeHtml(doc.document_number)}</strong></td><td>${escapeHtml(doc.customer_name)}</td><td><span class="type-badge">${DOC_LABELS[doc.document_type]}</span></td><td>${money(doc.grand_total)}</td><td><span class="status-badge status-${doc.status}">${documentStatusLabel(doc.status, doc.document_type)}</span></td></tr>
  `).join('') : '<tr><td colspan="5" class="table-empty">ยังไม่มีเอกสาร</td></tr>';
  renderDashboardCharts(result.analytics);
  refreshIcons();
}

function renderCustomerOptions() {
  const select = $('#doc-customer');
  select.innerHTML = '<option value="">เลือกลูกค้า</option>' + state.customers.filter((c) => c.active).map((c) => `<option value="${c.id}">${escapeHtml(c.name)} · ${CUSTOMER_TYPE_LABELS[c.customer_type]}</option>`).join('');
}

async function loadCustomers(search = '') {
  const status = $('#customer-status-filter')?.value || state.customerStatus || 'active';
  state.customerStatus = status;
  const result = await request(`/customers?limit=200&page=1&status=${status}&search=${encodeURIComponent(search)}`);
  state.customers = result.data;
  $('#customer-count').textContent = `${result.pagination.total} รายการ`;
  $('#customers-table').innerHTML = result.data.length ? result.data.map((c) => {
    const actions = c.active
      ? `${state.user.role !== 'viewer' ? actionIcon({icon:'pencil',title:'แก้ไขลูกค้า',data:{'customer-edit':c.id},className:'action-edit'}) : ''}${state.user.role === 'admin' ? actionIcon({icon:'user-x',title:'ปิดใช้งานลูกค้า',data:{'customer-deactivate':c.id},className:'action-danger'}) : ''}`
      : `${state.user.role === 'admin' ? actionIcon({icon:'rotate-ccw',title:'กู้คืนลูกค้า',data:{'customer-restore':c.id},className:'action-success'}) : ''}`;
    return `<tr class="${c.active ? '' : 'deleted-row'}"><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.code || '')}</small></td><td>${CUSTOMER_TYPE_LABELS[c.customer_type]}</td><td>${escapeHtml(c.tax_id || '-')}</td><td>${escapeHtml(c.phone || '-')}</td><td>${c.withholding_enabled ? `${Number(c.withholding_rate)}% · ${c.withholding_basis === 'service' ? 'เฉพาะบริการ' : 'ยอดรวม'}` : 'ไม่หัก'}</td><td><span class="status-badge ${c.active ? 'status-PAID' : 'status-CANCELLED'}">${c.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><div class="table-actions">${actions}</div></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="table-empty">ยังไม่มีข้อมูลลูกค้า</td></tr>';
  bindMasterDataButtons(); renderCustomerOptions(); refreshIcons();
}

async function loadProducts(search = '') {
  const status = $('#product-status-filter')?.value || state.productStatus || 'active';
  state.productStatus = status;
  const result = await request(`/products?limit=200&page=1&status=${status}&search=${encodeURIComponent(search)}`);
  state.products = result.data;
  $('#product-count').textContent = `${result.pagination.total} รายการ`;
  $('#products-table').innerHTML = result.data.length ? result.data.map((p) => {
    const actions = p.active
      ? `${state.user.role !== 'viewer' ? actionIcon({icon:'pencil',title:'แก้ไขสินค้า/บริการ',data:{'product-edit':p.id},className:'action-edit'}) : ''}${state.user.role === 'admin' ? actionIcon({icon:'package-x',title:'ปิดใช้งานสินค้า/บริการ',data:{'product-deactivate':p.id},className:'action-danger'}) : ''}`
      : `${state.user.role === 'admin' ? actionIcon({icon:'rotate-ccw',title:'กู้คืนสินค้า/บริการ',data:{'product-restore':p.id},className:'action-success'}) : ''}`;
    return `<tr class="${p.active ? '' : 'deleted-row'}"><td>${escapeHtml(p.sku || '-')}</td><td><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.category || '')}</small></td><td>${ITEM_TYPE_LABELS[p.item_type]}</td><td>${escapeHtml(p.unit)}</td><td>${money(p.price)}</td><td><span class="status-badge ${p.active ? 'status-PAID' : 'status-CANCELLED'}">${p.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><div class="table-actions">${actions}</div></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="table-empty">ยังไม่มีสินค้า/บริการ</td></tr>';
  bindMasterDataButtons(); ensureProductDatalist(); refreshIcons();
}

function customerPayload() { return {code:$('#customer-code').value,name:$('#customer-name').value,customer_type:$('#customer-type').value,tax_id:$('#customer-tax-id').value,branch_name:$('#customer-branch').value,address:$('#customer-address').value,phone:$('#customer-phone').value,email:$('#customer-email').value,withholding_enabled:$('#customer-withholding-enabled').checked,withholding_rate:$('#customer-withholding-rate').value,withholding_basis:$('#customer-withholding-basis').value,withholding_threshold:$('#customer-threshold').value,receipt_transfer_fee:$('#customer-transfer-fee').value}; }
function productPayload() { return {sku:$('#product-sku').value,name:$('#product-name').value,item_type:$('#product-type').value,unit:$('#product-unit').value,price:$('#product-price').value,category:$('#product-category').value}; }
function resetCustomerForm(){ $('#customer-form').reset(); $('#customer-edit-id').value=''; $('#customer-form-title').textContent='เพิ่มลูกค้า'; $('#customer-cancel-edit').classList.add('hidden'); $('#customer-type').value='general'; $('#customer-withholding-rate').value='3'; resetCustomerDefaults(); }
function resetProductForm(){ $('#product-form').reset(); $('#product-edit-id').value=''; $('#product-form-title').textContent='เพิ่มสินค้า / บริการ'; $('#product-cancel-edit').classList.add('hidden'); $('#product-unit').value='งาน'; $('#product-price').value='0'; }
function bindMasterDataButtons(){
  $$('[data-customer-edit]').forEach(b=>b.addEventListener('click',async()=>{const {data:c}=await request(`/customers/${b.dataset.customerEdit}`); $('#customer-edit-id').value=c.id; $('#customer-form-title').textContent='แก้ไขลูกค้า'; $('#customer-cancel-edit').classList.remove('hidden'); $('#customer-code').value=c.code||''; $('#customer-name').value=c.name||''; $('#customer-type').value=c.customer_type; $('#customer-tax-id').value=c.tax_id||''; $('#customer-branch').value=c.branch_name||''; $('#customer-address').value=c.address||''; $('#customer-phone').value=c.phone||''; $('#customer-email').value=c.email||''; $('#customer-withholding-enabled').checked=!!c.withholding_enabled; $('#customer-withholding-rate').value=c.withholding_rate; $('#customer-withholding-basis').value=c.withholding_basis; $('#customer-threshold').value=c.withholding_threshold; $('#customer-transfer-fee').value=c.receipt_transfer_fee; $('#customer-name').focus();}));
  $$('[data-product-edit]').forEach(b=>b.addEventListener('click',async()=>{const {data:p}=await request(`/products/${b.dataset.productEdit}`); $('#product-edit-id').value=p.id; $('#product-form-title').textContent='แก้ไขสินค้า / บริการ'; $('#product-cancel-edit').classList.remove('hidden'); $('#product-sku').value=p.sku||''; $('#product-name').value=p.name||''; $('#product-type').value=p.item_type; $('#product-unit').value=p.unit; $('#product-price').value=p.price; $('#product-category').value=p.category||''; $('#product-name').focus();}));
  $$('[data-customer-deactivate]').forEach(b=>b.addEventListener('click',async()=>{const reason=await promptReason('กรุณาระบุเหตุผลที่ปิดใช้งานลูกค้า','ไม่มีการใช้งานแล้ว'); if(!reason||!confirm('ยืนยันปิดใช้งานลูกค้ารายนี้? เอกสารเก่าจะไม่เปลี่ยนแปลง'))return; await request(`/customers/${b.dataset.customerDeactivate}/deactivate`,{method:'POST',body:JSON.stringify({reason})}); showToast('ปิดใช้งานลูกค้าแล้ว'); await loadCustomers($('#customer-search').value);}));
  $$('[data-product-deactivate]').forEach(b=>b.addEventListener('click',async()=>{const reason=await promptReason('กรุณาระบุเหตุผลที่ปิดใช้งานรายการ','ยกเลิกใช้งานรายการนี้'); if(!reason||!confirm('ยืนยันปิดใช้งานรายการนี้? เอกสารเก่าจะไม่เปลี่ยนแปลง'))return; await request(`/products/${b.dataset.productDeactivate}/deactivate`,{method:'POST',body:JSON.stringify({reason})}); showToast('ปิดใช้งานสินค้า/บริการแล้ว'); await loadProducts($('#product-search').value);}));
  $$('[data-customer-restore]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('ยืนยันกู้คืนลูกค้ารายนี้?'))return; await request(`/customers/${b.dataset.customerRestore}/restore`,{method:'POST'}); showToast('กู้คืนลูกค้าแล้ว'); await loadCustomers($('#customer-search').value);}));
  $$('[data-product-restore]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('ยืนยันกู้คืนรายการนี้?'))return; await request(`/products/${b.dataset.productRestore}/restore`,{method:'POST'}); showToast('กู้คืนสินค้า/บริการแล้ว'); await loadProducts($('#product-search').value);}));
}

function ensureProductDatalist() {
  let list = $('#product-master-list');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'product-master-list';
    document.body.appendChild(list);
  }
  list.innerHTML = state.products.filter((p) => p.active).map((p) => `<option value="${escapeHtml(p.name)}" data-id="${p.id}">${escapeHtml(p.sku || '')} · ${money(p.price)}</option>`).join('');
}

async function loadDocuments() {
  const search = $('#document-search').value.trim();
  const type = $('#document-type-filter').value;
  const status = $('#document-status-filter').value;
  const params = new URLSearchParams({ limit:'100', page:'1', search });
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (state.documentsTrashMode) params.set('deleted_only', 'true');

  const result = await request(`/documents?${params}`);
  const modeNote = $('#documents-mode-note');
  modeNote.classList.toggle('hidden', !state.documentsTrashMode);
  modeNote.innerHTML = state.documentsTrashMode
    ? '<i data-lucide="trash-2"></i><span>กำลังแสดงเอกสารในถังขยะ สามารถกู้คืนได้โดยผู้ดูแลระบบ</span>'
    : '';
  $('#trash-toggle').innerHTML = state.documentsTrashMode
    ? '<i data-lucide="files"></i> กลับคลังเอกสาร'
    : '<i data-lucide="trash-2"></i> ถังขยะ';

  $('#documents-table').innerHTML = result.data.length ? result.data.map((d) => {
    const actions = renderDocumentActions(d);
    return `<tr class="${d.deleted_at ? 'deleted-row' : ''}">
      <td><strong>${escapeHtml(d.document_number)}</strong>${d.deleted_at ? `<br><small>ลบเมื่อ ${dateThai(d.deleted_at)}</small>` : ''}</td>
      <td>${dateThai(d.document_date)}</td>
      <td>${escapeHtml(d.customer_name)}</td>
      <td><span class="type-badge">${DOC_LABELS[d.document_type]}</span></td>
      <td>${money(d.grand_total)}</td>
      <td>${money(d.net_total)}</td>
      <td><span class="status-badge status-${d.status}">${documentStatusLabel(d.status, d.document_type)}</span>${d.deleted_at ? '<br><small class="deleted-label">อยู่ในถังขยะ</small>' : ''}</td>
      <td><div class="table-actions">${actions}</div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="table-empty">${state.documentsTrashMode ? 'ถังขยะว่าง' : 'ยังไม่มีเอกสาร <button class="link-button writer-only" data-open-document>สร้างเอกสารฉบับแรก</button>'}</td></tr>`;
  bindDynamicDocumentButtons();
  refreshIcons();
}

function documentCapabilities(documentRow) {
  const role = state.user.role;
  const status = documentRow.status;
  const deleted = Boolean(documentRow.deleted_at);
  return {
    canEdit: !deleted && ((role === 'admin' && ['DRAFT','PENDING','APPROVED','IN_PROGRESS','OVERDUE'].includes(status)) || (role === 'staff' && ['DRAFT','PENDING','APPROVED','IN_PROGRESS'].includes(status))),
    canCancel: !deleted && ((role === 'admin' && ['DRAFT','PENDING','APPROVED','IN_PROGRESS','REJECTED','OVERDUE'].includes(status)) || (role === 'staff' && ['DRAFT','PENDING','APPROVED','IN_PROGRESS'].includes(status))),
    canDelete: !deleted && ((role === 'admin' && ['DRAFT','PENDING','REJECTED','CANCELLED'].includes(status)) || (role === 'staff' && ['DRAFT','PENDING'].includes(status))),
    canRestore: deleted && role === 'admin',
    canWorkflow: !deleted && ['admin','staff'].includes(role) && documentRow.document_type === 'QT'
  };
}

function actionIcon({ icon, title, data, className = '' }) {
  const attrs = Object.entries(data).map(([key, value]) => `data-${key}="${escapeHtml(String(value))}"`).join(' ');
  return `<button class="icon-action ${className}" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" ${attrs}><i data-lucide="${icon}"></i></button>`;
}

function renderDocumentActions(d) {
  const caps = documentCapabilities(d);
  const actions = [];
  if (!d.deleted_at) {
    actions.push(actionIcon({ icon:'eye', title:'ดูเอกสาร', data:{ 'view-id':d.id } }));
    actions.push(actionIcon({ icon:'printer', title:'พิมพ์เอกสาร', data:{ 'print-id':d.id }, className:'action-print' }));
  }
  actions.push(actionIcon({ icon:'history', title:'ดูประวัติการเปลี่ยนแปลง', data:{ 'audit-id':d.id } }));
  if (caps.canEdit) actions.push(actionIcon({ icon:'pencil', title:'แก้ไขเอกสาร', data:{ 'edit-id':d.id }, className:'action-edit' }));
  if (caps.canWorkflow && d.status === 'PENDING') {
    actions.push(actionIcon({ icon:'circle-check-big', title:'ลูกค้าอนุมัติ', data:{ 'status-id':d.id, status:'APPROVED' }, className:'action-success' }));
    actions.push(actionIcon({ icon:'circle-x', title:'ลูกค้าไม่อนุมัติ', data:{ 'status-id':d.id, status:'REJECTED' }, className:'action-danger' }));
  }
  if (caps.canWorkflow && d.status === 'APPROVED') {
    actions.push(actionIcon({ icon:'play', title:'เริ่มดำเนินงาน', data:{ 'status-id':d.id, status:'IN_PROGRESS' }, className:'action-success' }));
  }
  if (caps.canCancel) actions.push(actionIcon({ icon:'file-x-2', title:'ยกเลิกเอกสาร', data:{ 'cancel-id':d.id }, className:'action-warning' }));
  if (!d.deleted_at && ['admin','staff'].includes(state.user?.role) && !['PAID','CANCELLED','REJECTED'].includes(d.status)) {
    if (d.document_type === 'QT') {
      actions.push(actionIcon({ icon:'package-check', title:'สร้างใบส่งมอบจากเอกสารนี้', data:{ 'next-type':'DO', 'next-source':d.id }, className:'action-success' }));
      if (d.customer_type === 'private') {
        actions.push(actionIcon({ icon:'calendar-clock', title:'สร้างใบแจ้งหนี้จากเอกสารนี้', data:{ 'next-type':'IN', 'next-source':d.id }, className:'action-warning' }));
      }
      if (d.customer_type !== 'government') {
        actions.push(actionIcon({ icon:'badge-dollar-sign', title:'รับชำระและออกใบเสร็จ', data:{ 'next-type':'RC', 'next-source':d.id }, className:'action-success' }));
      }
    }
    if (['DO','IN','BN'].includes(d.document_type)) {
      actions.push(actionIcon({ icon:'badge-dollar-sign', title:'รับชำระและออกใบเสร็จ', data:{ 'next-type':'RC', 'next-source':d.id }, className:'action-success' }));
    }
  }
  if (caps.canDelete) actions.push(actionIcon({ icon:'trash-2', title:'ย้ายไปถังขยะ', data:{ 'delete-id':d.id }, className:'action-danger' }));
  if (caps.canRestore) actions.push(actionIcon({ icon:'rotate-ccw', title:'กู้คืนเอกสาร', data:{ 'restore-id':d.id }, className:'action-success' }));
  return actions.join('');
}

async function promptReason(message, defaultValue) {
  const value = window.prompt(message, defaultValue || '');
  if (value === null) return null;
  const reason = value.trim();
  if (reason.length < 3) {
    showGlobalError(new Error('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'));
    return null;
  }
  return reason;
}

async function openAuditModal(documentId) {
  const modal = $('#audit-modal');
  const list = $('#audit-list');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  list.innerHTML = '<div class="table-empty">กำลังโหลด...</div>';
  try {
    const result = await request(`/documents/${documentId}/audit`);
    $('#audit-document-number').textContent = result.document_number;
    const labels = {
      CREATE:'สร้างเอกสาร', UPDATE:'แก้ไขเอกสาร', UPDATE_STATUS:'เปลี่ยนสถานะ',
      CANCEL:'ยกเลิกเอกสาร', SOFT_DELETE:'ย้ายไปถังขยะ', RESTORE:'กู้คืนเอกสาร'
    };
    list.innerHTML = result.data.length ? result.data.map((entry) => `
      <article class="audit-entry">
        <div class="audit-entry-head"><strong>${escapeHtml(labels[entry.action] || entry.action)}</strong><time>${dateTimeThai(entry.created_at)}</time></div>
        <div class="audit-user"><i data-lucide="user-round"></i> ${escapeHtml(entry.user_name || 'ระบบ')}</div>
        <pre>${escapeHtml(JSON.stringify(entry.details || {}, null, 2))}</pre>
      </article>`).join('') : '<div class="table-empty">ยังไม่มีประวัติ</div>';
    refreshIcons();
  } catch (error) {
    list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
  }
}

function closeAuditModal() {
  $('#audit-modal').classList.add('hidden');
  document.body.style.overflow = $('#document-modal').classList.contains('hidden') ? '' : 'hidden';
}

function bindDynamicDocumentButtons() {
  $$('[data-view-id]').forEach((button) => button.addEventListener('click', () => window.open(`./print.html?id=${button.dataset.viewId}`, '_blank', 'noopener')));
  $$('[data-print-id]').forEach((button) => button.addEventListener('click', () => window.open(`./print.html?id=${button.dataset.printId}`, '_blank', 'noopener')));
  $$('[data-edit-id]').forEach((button) => button.addEventListener('click', () => openDocumentModal(Number(button.dataset.editId)).catch(showGlobalError)));
  $$('[data-next-type]').forEach((button) => button.addEventListener('click', () => openDocumentModal(null, button.dataset.nextType, Number(button.dataset.nextSource)).catch(showGlobalError)));
  $$('[data-audit-id]').forEach((button) => button.addEventListener('click', () => openAuditModal(Number(button.dataset.auditId))));
  $$('[data-status-id]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(`ยืนยันเปลี่ยนสถานะเป็น ${STATUS_LABELS[button.dataset.status]}?`)) return;
    try {
      await request(`/documents/${button.dataset.statusId}/status`, { method:'PATCH', body:JSON.stringify({ status:button.dataset.status }) });
      showToast('อัปเดตสถานะแล้ว');
      await Promise.all([loadDocuments(), loadDashboard()]);
    } catch (error) { showGlobalError(error); }
  }));
  $$('[data-cancel-id]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await promptReason('กรุณาระบุเหตุผลในการยกเลิกเอกสาร', 'ยกเลิกเนื่องจากข้อมูลไม่ถูกต้อง');
    if (!reason || !confirm('ยืนยันยกเลิกเอกสารนี้? เอกสารจะยังคงอยู่เพื่อการตรวจสอบย้อนหลัง')) return;
    try {
      await request(`/documents/${button.dataset.cancelId}/cancel`, { method:'POST', body:JSON.stringify({ reason }) });
      showToast('ยกเลิกเอกสารแล้ว');
      await Promise.all([loadDocuments(), loadDashboard()]);
    } catch (error) { showGlobalError(error); }
  }));
  $$('[data-delete-id]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await promptReason('กรุณาระบุเหตุผลในการลบเอกสาร', 'สร้างเอกสารผิดหรือข้อมูลซ้ำ');
    if (!reason || !confirm('ยืนยันย้ายเอกสารไปถังขยะ? ข้อมูลจะไม่ถูกลบถาวร')) return;
    try {
      await request(`/documents/${button.dataset.deleteId}`, { method:'DELETE', body:JSON.stringify({ reason }) });
      showToast('ย้ายเอกสารไปถังขยะแล้ว');
      await Promise.all([loadDocuments(), loadDashboard()]);
    } catch (error) { showGlobalError(error); }
  }));
  $$('[data-restore-id]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('ยืนยันกู้คืนเอกสารนี้กลับเข้าสู่คลังเอกสาร?')) return;
    try {
      await request(`/documents/${button.dataset.restoreId}/restore`, { method:'POST' });
      showToast('กู้คืนเอกสารแล้ว');
      await loadDocuments();
    } catch (error) { showGlobalError(error); }
  }));
  $$('[data-open-document]', $('#documents-table')).forEach((button) => button.addEventListener('click', () => openDocumentModal().catch(showGlobalError)));
}

function resetCustomerDefaults() {
  const type = $('#customer-type').value;
  const defaults = {
    general: { enabled:false, threshold:0, fee:0, basis:'none' },
    private: { enabled:true, threshold:1000, fee:20, basis:'full' },
    government: { enabled:true, threshold:10000, fee:0, basis:'full' }
  }[type];
  $('#customer-withholding-enabled').checked = defaults.enabled;
  $('#customer-threshold').value = defaults.threshold;
  $('#customer-transfer-fee').value = defaults.fee;
  $('#customer-withholding-basis').value = defaults.basis;
}

$('#customer-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button=event.submitter; setBusy(button,true);
  try { const id=$('#customer-edit-id').value; await request(id?`/customers/${id}`:'/customers',{method:id?'PUT':'POST',body:JSON.stringify(customerPayload())}); resetCustomerForm(); await loadCustomers($('#customer-search').value); showToast(id?'แก้ไขลูกค้าสำเร็จ':'เพิ่มลูกค้าสำเร็จ'); } catch(error){showGlobalError(error);} finally{setBusy(button,false);}
});
$('#customer-type').addEventListener('change', resetCustomerDefaults);
$('#customer-cancel-edit').addEventListener('click', resetCustomerForm);
$('#customer-search').addEventListener('input', debounce((e)=>loadCustomers(e.target.value).catch(showGlobalError),350));
$('#customer-status-filter').addEventListener('change',()=>loadCustomers($('#customer-search').value).catch(showGlobalError));

$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button=event.submitter; setBusy(button,true);
  try { const id=$('#product-edit-id').value; await request(id?`/products/${id}`:'/products',{method:id?'PUT':'POST',body:JSON.stringify(productPayload())}); resetProductForm(); await loadProducts($('#product-search').value); showToast(id?'แก้ไขสินค้า/บริการสำเร็จ':'เพิ่มสินค้า/บริการสำเร็จ'); } catch(error){showGlobalError(error);} finally{setBusy(button,false);}
});
$('#product-cancel-edit').addEventListener('click', resetProductForm);
$('#product-search').addEventListener('input', debounce((e)=>loadProducts(e.target.value).catch(showGlobalError),350));
$('#product-status-filter').addEventListener('change',()=>loadProducts($('#product-search').value).catch(showGlobalError));

const allowedTypesByCustomer = {
  general: ['QT','RC','DO'],
  private: ['QT','IN','BN','RC','DO'],
  government: ['QT','RC','DO']
};
function selectedCustomer() {
  return state.customers.find((customer) => String(customer.id) === $('#doc-customer').value);
}

const documentFlowCopy = {
  general: 'ใบเสนอราคา → รับชำระ หรือ ใบเสนอราคา → ส่งมอบงาน → รับชำระ',
  private: 'ใบเสนอราคา → ส่งมอบ/แจ้งหนี้ → วางบิล → รับชำระ',
  government: 'ใบเสนอราคา → ส่งมอบงาน → รับชำระ'
};

const documentDetailCopy = {
  QT: ['จัดทำใบเสนอราคา', 'เพิ่มรายการ ราคา เงื่อนไข และระยะเวลาที่เสนอให้ลูกค้า'],
  DO: ['บันทึกการส่งมอบ', 'เลือกใบเสนอราคาต้นทางเพื่อลดการกรอกข้อมูลซ้ำ'],
  IN: ['แจ้งยอดชำระ', 'เลือกใบเสนอราคา หรือกรอกรายการสำหรับลูกค้าเครดิต'],
  BN: ['รวมใบแจ้งหนี้เพื่อวางบิล', 'เลือกใบแจ้งหนี้หลายใบของลูกค้ารายเดียวกัน'],
  RC: ['รับชำระและออกใบเสร็จ', 'เลือกเอกสารที่ลูกค้าชำระ แล้วกรอกยอดรับจริง']
};

function setWizardStep(step) {
  const nextStep = Math.min(3, Math.max(1, Number(step) || 1));
  state.documentWizardStep = nextStep;
  $$('[data-wizard-step]').forEach((panel) => panel.classList.toggle('active', Number(panel.dataset.wizardStep) === nextStep));
  $$('[data-wizard-indicator]').forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.wizardIndicator);
    indicator.classList.toggle('active', indicatorStep === nextStep);
    indicator.classList.toggle('complete', indicatorStep < nextStep);
  });
  $('#wizard-back').classList.toggle('hidden', nextStep === 1);
  $('#wizard-next').classList.toggle('hidden', nextStep === 3);
  $('#save-document').classList.toggle('hidden', nextStep !== 3);
  $('#document-form-error').classList.add('hidden');
  $('.document-modal-card').scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
}

function selectedSourceInputs() {
  return $$('#source-documents-list input:checked');
}

function selectedSourceTotal() {
  return selectedSourceInputs().reduce((sum, input) => sum + (Number(input.dataset.total) || 0), 0);
}

function sourceDrivenDocument() {
  return !state.editingDocumentId && selectedSourceInputs().length > 0;
}

function updateSourceDrivenItems() {
  const type = $('#doc-type').value;
  const selectedCount = selectedSourceInputs().length;
  const driven = sourceDrivenDocument() || type === 'BN';
  $('#document-items').classList.toggle('hidden', driven);
  $('#add-item').classList.toggle('hidden', driven);
  $('#toggle-advanced-lines').classList.toggle('hidden', driven);
  $('#advanced-line-actions').classList.add('hidden');
  $('#source-items-notice').classList.toggle('hidden', !driven);

  const notice = $('#source-items-notice');
  if (notice) {
    const title = $('strong', notice);
    const detail = $('span', notice);
    if (type === 'BN') {
      title.textContent = selectedCount ? `รวมใบแจ้งหนี้ ${selectedCount} ใบอัตโนมัติ` : 'เลือกใบแจ้งหนี้เพื่อสร้างใบวางบิล';
      detail.textContent = 'ยอดและเลขที่ใบแจ้งหนี้จะถูกสร้างเป็นรายการในใบวางบิลโดยไม่ต้องกรอกซ้ำ';
    } else if (driven) {
      title.textContent = 'รายการจะดึงจากเอกสารต้นทาง';
      detail.textContent = 'ไม่ต้องกรอกซ้ำ ช่วยลดความผิดพลาดของยอดและรายละเอียด';
    }
  }
  updateDocumentPreview();
}

function updateReceiptPaymentVisibility({ applyDefaults = false } = {}) {
  const isReceipt = $('#doc-type').value === 'RC';
  $('#receipt-payment-box').classList.toggle('hidden', !isReceipt);
  if (!isReceipt) return;

  const customer = selectedCustomer();
  if (applyDefaults) {
    $('#doc-receipt-withholding-enabled').checked = Boolean(customer?.withholding_enabled);
    $('#doc-receipt-withholding-rate').value = customer?.withholding_rate ?? 0;
    $('#doc-receipt-withholding-amount').value = '';
    $('#doc-receipt-transfer-fee').value = customer?.receipt_transfer_fee ?? 0;
    $('#doc-payment-received-date').value = $('#doc-date').value || today();
    $('#doc-withholding-certificate-number').value = '';
    $('#doc-withholding-certificate-date').value = '';
  }
}

function updateAdaptiveDocumentFields() {
  const type = $('#doc-type').value;
  const [title, description] = documentDetailCopy[type] || documentDetailCopy.QT;
  $('#wizard-details-title').textContent = title;
  $('#wizard-details-description').textContent = description;
  $('#doc-due-date-field').classList.toggle('hidden', !['IN', 'BN'].includes(type));
  $('#preview-total-label').textContent = type === 'RC'
    ? 'จำนวนเงินที่ได้รับจริง'
    : type === 'BN'
      ? 'ยอดรวมวางบิล'
      : type === 'IN'
        ? 'ยอดรวมใบแจ้งหนี้'
        : 'ยอดรวมเอกสาร';
  $('#preview-summary-note').textContent = type === 'RC'
    ? 'ยอดรับจริงหลังหัก ณ ที่จ่ายและค่าธรรมเนียม'
    : type === 'BN'
      ? 'ใบวางบิลแสดงยอดเต็ม ภาษีหัก ณ ที่จ่ายบันทึกตอนออกใบเสร็จ'
      : 'ภาษีหัก ณ ที่จ่ายจะบันทึกเมื่อออกใบเสร็จรับเงินจริง';
  updateReceiptPaymentVisibility();
  updateSourceDrivenItems();
}

function updateAllowedDocumentTypes() {
  const customer = selectedCustomer();
  if (!customer) {
    $$('[data-doc-type-card]').forEach((card) => {
      card.disabled = Boolean(state.editingDocumentId);
      card.classList.remove('unavailable');
      card.classList.toggle('selected', card.dataset.docTypeCard === $('#doc-type').value);
    });
    $('#doc-customer-help').textContent = 'เลือกประเภทลูกค้าเพื่อให้ระบบแนะนำ Workflow ที่เหมาะสม';
    $('#document-flow-hint span').textContent = 'เลือกลูกค้าก่อน ระบบจะแนะนำขั้นตอนเอกสารให้อัตโนมัติ';
    updateAdaptiveDocumentFields();
    return;
  }
  const allowed = allowedTypesByCustomer[customer.customer_type] || ['QT'];
  $$('[data-doc-type-card]').forEach((card) => {
    const enabled = allowed.includes(card.dataset.docTypeCard);
    card.disabled = !enabled || Boolean(state.editingDocumentId);
    card.classList.toggle('unavailable', !enabled);
  });
  if (!allowed.includes($('#doc-type').value)) $('#doc-type').value = allowed[0];
  $$('[data-doc-type-card]').forEach((card) => card.classList.toggle('selected', card.dataset.docTypeCard === $('#doc-type').value));
  $('#document-flow-hint span').textContent = documentFlowCopy[customer.customer_type] || documentFlowCopy.general;
  $('#doc-customer-help').textContent = `${CUSTOMER_TYPE_LABELS[customer.customer_type]} · ระบบเปิดเฉพาะเอกสารที่เหมาะกับลูกค้าประเภทนี้`;
  updateAdaptiveDocumentFields();
}

async function selectDocumentType(type, { loadSources = true, applyDefaults = true } = {}) {
  const card = $(`[data-doc-type-card="${type}"]`);
  if (card?.disabled && !state.editingDocumentId) return;
  $('#doc-type').value = type;
  $$('[data-doc-type-card]').forEach((item) => item.classList.toggle('selected', item.dataset.docTypeCard === type));
  updateAdaptiveDocumentFields();
  if (type !== 'RC') {
    $('#doc-receipt-withholding-enabled').checked = false;
    $('#doc-receipt-withholding-amount').value = '';
  } else if (applyDefaults) {
    updateReceiptPaymentVisibility({ applyDefaults: true });
  }
  if (loadSources && !state.editingDocumentId) await loadSourceDocuments();
  updateDocumentPreview();
}

function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function resetDocumentFormForCreate() {
  $('#document-form').reset();
  $$('[data-doc-type-card]').forEach((card) => {
    card.disabled = false;
    card.classList.remove('unavailable');
  });
  $('#document-items').innerHTML = '';
  $('#source-documents-list').innerHTML = '';
  $('#document-form-error').classList.add('hidden');
  $('#doc-date').value = today();
  $('#doc-discount').value = '0';
  $('#doc-type').value = 'QT';
  $('#doc-due-date').value = '';
  $('#doc-remarks').value = '';
  $('#doc-payment-terms').value = '';
  $('#doc-delivery-days').value = '';
  $('#doc-validity-days').value = '';
  $('#doc-show-signature').checked = false;
  updateSignatureOptionAvailability();
  addDocumentLine('item');
}

async function openDocumentModal(documentId = null, preferredType = null, preferredSourceId = null) {
  state.editingDocumentId = documentId ? Number(documentId) : null;
  state.documentWizardStep = 1;
  $('#document-form').reset();
  $('#document-items').innerHTML = '';
  $('#source-documents-list').innerHTML = '';
  $('#document-form-error').classList.add('hidden');

  if (state.editingDocumentId) {
    const result = await request(`/documents/${state.editingDocumentId}`);
    const doc = result.data;
    $('#document-modal-title').textContent = `แก้ไข ${doc.document_number}`;
    $('#document-modal-subtitle').textContent = 'ตรวจสอบและแก้ไขเฉพาะข้อมูลที่สถานะเอกสารอนุญาต';
    $('#save-document').innerHTML = '<i data-lucide="save"></i> ยืนยันการแก้ไข';
    $('#doc-type').value = doc.document_type;
    $('#doc-customer').value = String(doc.customer_id);
    $('#doc-date').value = toDateInputValue(doc.document_date);
    $('#doc-due-date').value = toDateInputValue(doc.due_date);
    $('#doc-discount').value = doc.discount ?? 0;
    $('#doc-remarks').value = doc.remarks || '';
    $('#doc-payment-terms').value = doc.payment_terms || '';
    $('#doc-delivery-days').value = doc.delivery_days ?? '';
    $('#doc-validity-days').value = doc.quotation_validity_days ?? '';
    $('#doc-receipt-withholding-enabled').checked = Boolean(doc.withholding_is_actual) && Number(doc.withholding_amount || 0) > 0;
    $('#doc-receipt-withholding-rate').value = doc.withholding_rate ?? 0;
    $('#doc-receipt-withholding-amount').value = doc.withholding_amount ?? 0;
    $('#doc-receipt-transfer-fee').value = doc.transfer_fee ?? 0;
    $('#doc-payment-received-date').value = toDateInputValue(doc.payment_received_date || doc.document_date);
    $('#doc-withholding-certificate-number').value = doc.withholding_certificate_number || '';
    $('#doc-withholding-certificate-date').value = toDateInputValue(doc.withholding_certificate_date);
    $('#doc-show-signature').checked = Boolean(doc.show_signature);
    updateSignatureOptionAvailability();
    doc.items.forEach((item) => addDocumentLine(item.line_type, item));
    $('#source-documents-box').classList.add('hidden');
    updateAllowedDocumentTypes();
    await selectDocumentType(doc.document_type, { loadSources: false, applyDefaults: false });
    setWizardStep(2);
  } else {
    resetDocumentFormForCreate();
    $('#document-modal-title').textContent = 'สร้างเอกสารแบบง่าย';
    $('#document-modal-subtitle').textContent = 'เลือกงาน → กรอกรายละเอียด → ตรวจสอบและบันทึก';
    $('#save-document').innerHTML = '<i data-lucide="save"></i> ยืนยันและบันทึก';
    if (preferredSourceId) {
      const sourceResult = await request(`/documents/${preferredSourceId}`);
      $('#doc-customer').value = String(sourceResult.data.customer_id);
    }
    updateAllowedDocumentTypes();
    await selectDocumentType(preferredType || 'QT', { loadSources: true, applyDefaults: true });
    if (preferredSourceId) {
      const sourceInput = $(`#source-documents-list input[value="${preferredSourceId}"]`);
      if (sourceInput) {
        sourceInput.checked = true;
        updateSourceDrivenItems();
      }
      setWizardStep(2);
    } else {
      setWizardStep(1);
    }
  }

  $('#document-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  updateDocumentPreview();
  refreshIcons();
}

function closeDocumentModal() {
  $('#document-modal').classList.add('hidden');
  document.body.style.overflow = '';
  state.editingDocumentId = null;
  state.documentWizardStep = 1;
}

$$('[data-close-document]').forEach((element) => element.addEventListener('click', closeDocumentModal));
$$('[data-close-audit]').forEach((element) => element.addEventListener('click', closeAuditModal));
$$('[data-open-document]').forEach((element) => element.addEventListener('click', () => openDocumentModal().catch(showGlobalError)));
$('#quick-create').addEventListener('click', () => openDocumentModal().catch(showGlobalError));
$$('[data-start-document]').forEach((button) => button.addEventListener('click', () => openDocumentModal(null, button.dataset.startDocument).catch(showGlobalError)));

$$('[data-doc-type-card]').forEach((card) => card.addEventListener('click', () => {
  selectDocumentType(card.dataset.docTypeCard).catch(showGlobalError);
}));

function addDocumentLine(lineType = 'item', data = {}) {
  const row = document.createElement('div');
  row.className = `document-line ${lineType}-line`;
  row.dataset.lineType = lineType;
  row.dataset.productId = data.product_id || '';

  if (lineType === 'item') {
    row.innerHTML = `
      <div class="line-kind"><select class="line-item-type" aria-label="ประเภทรายการ"><option value="service">ค่าแรง</option><option value="product">สินค้า</option><option value="travel">เดินทาง</option><option value="other">อื่น ๆ</option></select></div>
      <div class="line-main"><input class="line-description" list="product-master-list" placeholder="ค้นหาจากคลัง หรือพิมพ์รายละเอียดสินค้า/บริการ" value="${escapeHtml(data.description || '')}"><small>เลือกรายการเดิมเพื่อเติมหน่วยและราคาอัตโนมัติ</small></div>
      <label class="mini-field"><span>จำนวน</span><input class="line-quantity" type="number" min="0.01" step="0.01" value="${data.quantity || 1}"></label>
      <label class="mini-field"><span>หน่วย</span><input class="line-unit" value="${escapeHtml(data.unit || 'งาน')}"></label>
      <label class="mini-field"><span>ราคา/หน่วย</span><input class="line-price" type="number" min="0" step="0.01" value="${data.unit_price || 0}"></label>
      <div class="line-total"><span>รวม</span><strong>฿0.00</strong></div>
      <button class="remove-line" type="button" aria-label="ลบรายการ"><i data-lucide="trash-2"></i></button>`;
    $('.line-item-type', row).value = data.item_type || 'service';
  } else {
    row.innerHTML = `
      <div class="line-kind"><select class="line-type"><option value="${lineType}">${lineType === 'section' ? 'หัวข้อ' : 'หมายเหตุ'}</option><option value="item">คิดเงิน</option><option value="${lineType === 'section' ? 'note' : 'section'}">${lineType === 'section' ? 'หมายเหตุ' : 'หัวข้อ'}</option></select></div>
      <div class="line-main line-main-wide"><input class="line-description" placeholder="${lineType === 'section' ? 'ชื่อหัวข้อ เช่น งานติดตั้งสำนักงาน' : 'ข้อความหมายเหตุ'}" value="${escapeHtml(data.description || '')}"></div>
      <select class="line-style"><option value="${lineType === 'section' ? 'bold' : 'normal'}">${lineType === 'section' ? 'ตัวหนา' : 'ปกติ'}</option><option value="warning">ข้อความเตือน</option><option value="bold">ตัวหนา</option></select>
      <button class="remove-line" type="button" aria-label="ลบ"><i data-lucide="trash-2"></i></button>`;
    $('.line-style', row).value = data.text_style || (lineType === 'section' ? 'bold' : 'normal');
  }

  $('.remove-line', row).addEventListener('click', () => {
    row.remove();
    if (!$$('.document-line', $('#document-items')).length) addDocumentLine('item');
    updateDocumentPreview();
  });
  $('.line-type', row)?.addEventListener('change', (event) => {
    const replacementType = event.target.value;
    const description = $('.line-description', row)?.value || '';
    row.remove();
    addDocumentLine(replacementType, { description });
  });
  $$('input,select', row).forEach((input) => input.addEventListener('input', updateDocumentPreview));
  if (lineType === 'item') {
    $('.line-description', row).addEventListener('change', () => {
      const product = state.products.find((item) => item.name === $('.line-description', row).value);
      if (product) {
        row.dataset.productId = product.id;
        $('.line-item-type', row).value = product.item_type;
        $('.line-unit', row).value = product.unit;
        $('.line-price', row).value = product.price;
        updateDocumentPreview();
      }
    });
  }
  $('#document-items').appendChild(row);
  updateDocumentPreview();
  refreshIcons();
}

$('#add-item').addEventListener('click', () => addDocumentLine('item'));
$('#add-section').addEventListener('click', () => addDocumentLine('section'));
$('#add-note').addEventListener('click', () => addDocumentLine('note'));
$('#toggle-advanced-lines').addEventListener('click', () => $('#advanced-line-actions').classList.toggle('hidden'));

function collectDocumentItems() {
  if (sourceDrivenDocument()) return [];
  return $$('.document-line', $('#document-items')).map((row) => {
    const lineType = row.dataset.lineType;
    if (lineType !== 'item') {
      return {
        line_type: lineType,
        description: $('.line-description', row).value,
        text_style: $('.line-style', row).value
      };
    }
    return {
      line_type: 'item',
      item_type: $('.line-item-type', row).value,
      product_id: row.dataset.productId ? Number(row.dataset.productId) : null,
      description: $('.line-description', row).value,
      quantity: $('.line-quantity', row).value,
      unit: $('.line-unit', row).value,
      unit_price: $('.line-price', row).value,
      text_style: 'normal'
    };
  }).filter((item) => item.description.trim());
}

function updateDocumentPreview() {
  let product = 0;
  let service = 0;
  let other = 0;
  $$('.document-line.item-line', $('#document-items')).forEach((row) => {
    const lineTotal = (Number($('.line-quantity', row)?.value) || 0) * (Number($('.line-price', row)?.value) || 0);
    const totalElement = $('.line-total strong', row);
    if (totalElement) totalElement.textContent = money(lineTotal);
    const type = $('.line-item-type', row)?.value;
    if (type === 'product') product += lineTotal;
    else if (type === 'service') service += lineTotal;
    else other += lineTotal;
  });

  if (sourceDrivenDocument() || $('#doc-type').value === 'BN') {
    product = 0;
    service = 0;
    other = selectedSourceTotal();
  }

  const subtotal = product + service + other;
  const grandTotal = Math.max(subtotal - (Number($('#doc-discount').value) || 0), 0);
  let withholding = 0;
  let transferFee = 0;

  // ภาษีหัก ณ ที่จ่ายคำนวณเฉพาะใบเสร็จรับเงิน (RC)
  if ($('#doc-type').value === 'RC') {
    transferFee = Number($('#doc-receipt-transfer-fee').value) || 0;
    if ($('#doc-receipt-withholding-enabled').checked) {
      const enteredAmount = $('#doc-receipt-withholding-amount').value;
      withholding = enteredAmount === ''
        ? grandTotal * (Number($('#doc-receipt-withholding-rate').value) || 0) / 100
        : Number(enteredAmount) || 0;
    }
  }

  const netTotal = Math.max(grandTotal - withholding - transferFee, 0);
  $('#preview-product').textContent = money(product);
  $('#preview-service').textContent = money(service);
  $('#preview-subtotal').textContent = money(subtotal);
  $('#preview-total').textContent = money(netTotal);
}

$('#doc-discount').addEventListener('input', updateDocumentPreview);
$('#doc-show-signature').addEventListener('change', updateSignatureOptionAvailability);
[
  '#doc-receipt-withholding-enabled',
  '#doc-receipt-withholding-rate',
  '#doc-receipt-withholding-amount',
  '#doc-receipt-transfer-fee'
].forEach((selector) => $(selector).addEventListener('input', updateDocumentPreview));
$('#doc-date').addEventListener('change', () => {
  if ($('#doc-type').value === 'RC' && !$('#doc-payment-received-date').value) {
    $('#doc-payment-received-date').value = $('#doc-date').value;
  }
});

function sourceSelectionCopy(type) {
  if (type === 'BN') return ['เลือกใบแจ้งหนี้ที่ต้องการรวม', 'เลือกได้หลายใบ ระบบรวมยอดและป้องกันการวางบิลซ้ำ'];
  if (type === 'RC') return ['เลือกยอดที่ลูกค้าชำระ', 'เลือกเพียงหนึ่งเอกสาร เพื่อไม่ให้ยอดและความสัมพันธ์ซ้ำซ้อน'];
  if (type === 'DO') return ['เลือกใบเสนอราคาที่ส่งมอบ', 'ระบบคัดลอกรายการและจำนวนจากใบเสนอราคา'];
  if (type === 'IN') return ['เลือกใบเสนอราคาที่ต้องการแจ้งหนี้', 'ระบบคัดลอกรายการและยอดมาให้อัตโนมัติ'];
  return ['เลือกเอกสารต้นทาง', 'ระบบจะเชื่อมสถานะและข้อมูลให้อัตโนมัติ'];
}

async function loadSourceDocuments() {
  if (state.editingDocumentId) {
    $('#source-documents-box').classList.add('hidden');
    return;
  }
  updateAllowedDocumentTypes();
  const customerId = $('#doc-customer').value;
  const targetType = $('#doc-type').value;
  const box = $('#source-documents-box');
  const list = $('#source-documents-list');
  const empty = $('#source-empty-help');
  list.innerHTML = '';
  empty.classList.add('hidden');
  if (!customerId || targetType === 'QT') {
    box.classList.add('hidden');
    updateSourceDrivenItems();
    return;
  }

  const [title, description] = sourceSelectionCopy(targetType);
  $('#source-box-title').textContent = title;
  $('#source-box-description').textContent = description;
  const result = await request(`/documents/sources?target_type=${targetType}&customer_id=${customerId}`);
  const shouldShowEmpty = ['BN', 'RC'].includes(targetType);
  box.classList.toggle('hidden', !result.data.length && !shouldShowEmpty);

  if (!result.data.length) {
    empty.classList.toggle('hidden', !shouldShowEmpty);
    updateSourceDrivenItems();
    return;
  }

  const inputType = targetType === 'BN' ? 'checkbox' : 'radio';
  list.innerHTML = result.data.map((documentRow) => `
    <label class="source-option source-document-card">
      <input type="${inputType}" name="source-document" value="${documentRow.id}" data-total="${Number(documentRow.grand_total || 0)}">
      <span class="source-check"><i data-lucide="check"></i></span>
      <span class="source-document-copy"><strong>${escapeHtml(documentRow.document_number)}</strong><small>${DOC_LABELS[documentRow.document_type]} · ${dateThai(documentRow.document_date)}</small></span>
      <strong class="source-amount">${money(documentRow.grand_total)}</strong>
    </label>`).join('');
  $$('input', list).forEach((input) => input.addEventListener('change', () => {
    updateSourceDrivenItems();
    updateDocumentPreview();
  }));
  refreshIcons();
  updateSourceDrivenItems();
}

$('#doc-customer').addEventListener('change', () => {
  updateAllowedDocumentTypes();
  if (!state.editingDocumentId) {
    updateReceiptPaymentVisibility({ applyDefaults: true });
    loadSourceDocuments().catch(showGlobalError);
  }
  updateDocumentPreview();
});

function showDocumentFormError(message) {
  const errorBox = $('#document-form-error');
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
  errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validateWizardStep(step) {
  if (step === 1) {
    if (!$('#doc-customer').value) return 'กรุณาเลือกลูกค้า';
    if (!$('#doc-date').value) return 'กรุณาระบุวันที่เอกสาร';
    const customer = selectedCustomer();
    if (!customer || !(allowedTypesByCustomer[customer.customer_type] || []).includes($('#doc-type').value)) {
      return 'ประเภทเอกสารนี้ไม่เหมาะกับลูกค้าที่เลือก';
    }
  }
  if (step === 2) {
    const type = $('#doc-type').value;
    const sourceCount = selectedSourceInputs().length;
    const items = collectDocumentItems();
    if (type === 'BN' && sourceCount === 0) return 'ใบวางบิลต้องเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ';
    if (type !== 'BN' && sourceCount > 1) return 'เอกสารประเภทนี้เลือกเอกสารต้นทางได้เพียง 1 ใบ';
    if (sourceCount === 0 && items.length === 0) return 'กรุณาเพิ่มรายการสินค้า/บริการ หรือเลือกเอกสารต้นทาง';
    const emptyItem = items.find((item) => item.line_type === 'item' && (!item.description || Number(item.quantity) <= 0));
    if (emptyItem) return 'กรุณาตรวจรายละเอียดและจำนวนของรายการสินค้า/บริการ';
    if (type === 'RC' && !$('#doc-payment-received-date').value) return 'กรุณาระบุวันที่รับเงินจริง';
  }
  return '';
}

function reviewRow(label, value, strong = false) {
  return `<div class="review-row"><span>${escapeHtml(label)}</span><${strong ? 'strong' : 'b'}>${escapeHtml(String(value || '-'))}</${strong ? 'strong' : 'b'}></div>`;
}

function renderDocumentReview() {
  const type = $('#doc-type').value;
  const customer = selectedCustomer();
  const sources = selectedSourceInputs();
  const items = collectDocumentItems();
  const sourceNames = sources.map((input) => $('.source-document-copy strong', input.closest('label'))?.textContent || input.value);
  const receiptDetails = type === 'RC' ? `
    <section class="review-card"><h4><i data-lucide="badge-dollar-sign"></i> ข้อมูลรับชำระ</h4>
      ${reviewRow('วันที่รับเงินจริง', dateThai($('#doc-payment-received-date').value))}
      ${reviewRow('หัก ณ ที่จ่าย', $('#doc-receipt-withholding-enabled').checked ? `${$('#doc-receipt-withholding-rate').value || 0}%` : 'ไม่หัก')}
      ${reviewRow('ค่าธรรมเนียมโอน', money($('#doc-receipt-transfer-fee').value || 0))}
    </section>` : '';

  $('#document-review').innerHTML = `
    <div class="review-grid">
      <section class="review-card review-primary"><h4><i data-lucide="file-check-2"></i> เอกสาร</h4>
        ${reviewRow('ประเภท', DOC_LABELS[type], true)}
        ${reviewRow('ลูกค้า', customer?.name || '-')}
        ${reviewRow('วันที่เอกสาร', dateThai($('#doc-date').value))}
        ${['IN', 'BN'].includes(type) ? reviewRow('ครบกำหนด', $('#doc-due-date').value ? dateThai($('#doc-due-date').value) : 'ไม่ระบุ') : ''}
      </section>
      <section class="review-card"><h4><i data-lucide="link-2"></i> ที่มาของข้อมูล</h4>
        ${reviewRow('เอกสารต้นทาง', sourceNames.length ? sourceNames.join(', ') : 'สร้างรายการใหม่')}
        ${reviewRow('จำนวนรายการ', sourceNames.length ? `ดึงอัตโนมัติจาก ${sourceNames.length} เอกสาร` : `${items.filter((item) => item.line_type === 'item').length} รายการ`)}
        ${reviewRow('หมายเหตุ', $('#doc-remarks').value || 'ไม่มี')}
        ${reviewRow('ลายเซ็นในเอกสาร', $('#doc-show-signature').checked ? 'แสดงลายเซ็นที่บันทึกไว้' : 'ไม่แสดง / เซ็นด้วยมือ')}
      </section>
      ${receiptDetails}
      <section class="review-card review-total"><h4><i data-lucide="calculator"></i> ยอดสรุป</h4>
        ${reviewRow('รวมก่อนส่วนลด', $('#preview-subtotal').textContent)}
        ${reviewRow('ส่วนลด', money($('#doc-discount').value || 0))}
        ${reviewRow($('#preview-total-label').textContent, $('#preview-total').textContent, true)}
      </section>
    </div>`;
  refreshIcons();
}

$('#wizard-next').addEventListener('click', () => {
  const error = validateWizardStep(state.documentWizardStep);
  if (error) return showDocumentFormError(error);
  if (state.documentWizardStep === 2) renderDocumentReview();
  setWizardStep(state.documentWizardStep + 1);
});

$('#wizard-back').addEventListener('click', () => setWizardStep(state.documentWizardStep - 1));

$('#document-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#save-document');
  const errorBox = $('#document-form-error');
  errorBox.classList.add('hidden');
  const validationError = validateWizardStep(2);
  if (validationError) {
    setWizardStep(2);
    showDocumentFormError(validationError);
    return;
  }
  setBusy(button, true);
  try {
    const sourceIds = state.editingDocumentId ? [] : selectedSourceInputs().map((input) => Number(input.value));
    const payload = {
      document_type: $('#doc-type').value,
      document_date: $('#doc-date').value,
      due_date: $('#doc-due-date').value || null,
      customer_id: Number($('#doc-customer').value),
      discount: $('#doc-discount').value || 0,
      remarks: $('#doc-remarks').value,
      payment_terms: $('#doc-payment-terms').value,
      delivery_days: $('#doc-delivery-days').value ? Number($('#doc-delivery-days').value) : null,
      quotation_validity_days: $('#doc-validity-days').value ? Number($('#doc-validity-days').value) : null,
      receipt_withholding_enabled: $('#doc-type').value === 'RC' ? $('#doc-receipt-withholding-enabled').checked : false,
      receipt_withholding_rate: $('#doc-type').value === 'RC' ? ($('#doc-receipt-withholding-rate').value || 0) : 0,
      receipt_withholding_amount: $('#doc-type').value === 'RC' && $('#doc-receipt-withholding-amount').value !== ''
        ? $('#doc-receipt-withholding-amount').value
        : undefined,
      receipt_transfer_fee: $('#doc-type').value === 'RC' ? ($('#doc-receipt-transfer-fee').value || 0) : 0,
      payment_received_date: $('#doc-type').value === 'RC' ? ($('#doc-payment-received-date').value || $('#doc-date').value) : null,
      withholding_certificate_number: $('#doc-type').value === 'RC' ? $('#doc-withholding-certificate-number').value : null,
      withholding_certificate_date: $('#doc-type').value === 'RC' ? ($('#doc-withholding-certificate-date').value || null) : null,
      show_signature: $('#doc-show-signature').checked,
      items: collectDocumentItems()
    };
    if (!state.editingDocumentId) payload.source_document_ids = sourceIds;

    const editingId = state.editingDocumentId;
    const result = await request(editingId ? `/documents/${editingId}` : '/documents', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    closeDocumentModal();
    showToast(editingId ? `แก้ไข ${result.data.document_number} สำเร็จ` : `สร้าง ${result.data.document_number} สำเร็จ`);
    await Promise.all([loadDashboard(), loadDocuments()]);
    if (!editingId && confirm('สร้างเอกสารสำเร็จ ต้องการเปิดหน้าพิมพ์หรือไม่?')) {
      window.open(`./print.html?id=${result.data.id}`, '_blank', 'noopener');
    }
  } catch (error) {
    const detail = error.details?.length ? `: ${error.details.map((item) => item.message).join(', ')}` : '';
    showDocumentFormError(`${error.message}${detail}`);
  } finally {
    setBusy(button, false);
  }
});

async function loadReport() {
  const month = $('#report-month').value || currentMonth();
  $('#report-month').value = month;
  const result = await request(`/reports/monthly?month=${month}`);
  const label = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month:'long', year:'numeric' }).format(new Date(`${month}-01T00:00:00`));
  $('#report-month-label').textContent = label;
  $('#report-product-total').textContent = money(result.summary.product_total);
  $('#report-service-total').textContent = money(result.summary.service_total);
  $('#report-received-total').textContent = money(result.summary.received_total);
  $('#report-withholding-total').textContent = money(result.summary.withholding_total);
  $('#report-table').innerHTML = result.documents.length ? result.documents.map((d) => `<tr><td>${dateThai(d.document_date)}</td><td>${escapeHtml(d.document_number)}</td><td>${escapeHtml(d.customer_name)}</td><td><span class="report-doc-type report-type-${d.document_type}">${DOC_LABELS[d.document_type]}</span></td><td>${money(d.grand_total)}</td><td>${money(d.withholding_amount)}</td><td>${money(d.transfer_fee)}</td><td>${money(d.net_total)}</td></tr>`).join('') : '<tr><td colspan="8" class="table-empty">ไม่มีข้อมูลในเดือนนี้</td></tr>';
  renderReportCharts(result);
}
$('#load-report').addEventListener('click', () => loadReport().catch(showGlobalError));
$('#print-report').addEventListener('click', () => { document.body.classList.add('print-mode-report'); window.print(); });
window.addEventListener('afterprint', () => document.body.classList.remove('print-mode-report'));

function renderNumberingSettings(config) {
  const types = ['QT','IN','BN','RC','DO'];
  $('#numbering-settings').innerHTML = types.map((type) => {
    const c = config[type] || { prefix:type,digits:3,period:'BYYMM',separator:'-' };
    return `<div class="numbering-row" data-numbering-type="${type}"><strong>${type}</strong><label>Prefix<input class="num-prefix" value="${escapeHtml(c.prefix)}"></label><label>หลัก<input class="num-digits" type="number" min="1" max="8" value="${c.digits}"></label><label>รอบเลข<select class="num-period"><option value="BYYMM">ปี พ.ศ.+เดือน</option><option value="BYY">ปี พ.ศ.</option><option value="MMBYY">เดือน+ปี พ.ศ.</option><option value="NONE">ต่อเนื่อง</option></select></label><label>คั่น<input class="num-separator" value="${escapeHtml(c.separator ?? '-')}"></label></div>`;
  }).join('');
  $$('[data-numbering-type]').forEach((row) => { $('.num-period', row).value = config[row.dataset.numberingType]?.period || 'BYYMM'; });
}

async function loadSettings() {
  const result = await request('/settings');
  state.settings = result.data;
  const s = result.data;
  $('#setting-shop-th').value = s.shop_name_th || '';
  $('#setting-shop-en').value = s.shop_name_en || '';
  $('#setting-owner').value = s.shop_owner || '';
  $('#setting-address').value = s.shop_address || '';
  $('#setting-tax-id').value = s.shop_tax_id || '';
  $('#setting-phone').value = s.shop_phone || '';
  $('#setting-email').value = s.shop_email || '';
  $('#setting-scb').value = s.scb_bank_details || '';
  $('#setting-ktb').value = s.ktb_bank_details || '';
  setStoredImageState('logo', s.logo_url || '');
  setStoredImageState('signature', s.saved_signature_url || '');
  $('#feature-realtime').checked = Boolean(s.feature_flags?.realtime);
  $('#feature-auto-backup').checked = Boolean(s.feature_flags?.automatic_backup);
  $('#feature-email').checked = Boolean(s.feature_flags?.email_notifications);
  renderNumberingSettings(s.numbering_config || {});
  applyBrand();
  updateSignatureOptionAvailability();
}

function collectNumberingConfig() {
  const config = {};
  $$('[data-numbering-type]').forEach((row) => {
    config[row.dataset.numberingType] = {
      prefix: $('.num-prefix', row).value,
      digits: Number($('.num-digits', row).value),
      period: $('.num-period', row).value,
      separator: $('.num-separator', row).value
    };
  });
  return config;
}

$('#setting-logo-file').addEventListener('change', (event) => handleImageFileChange('logo', event));
$('#setting-signature-file').addEventListener('change', (event) => handleImageFileChange('signature', event));
$('#remove-logo-button').addEventListener('click', () => removeStoredImage('logo'));
$('#remove-signature-button').addEventListener('click', () => removeStoredImage('signature'));

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    const logoSource = await uploadSelectedImage('logo');
    const signatureSource = await uploadSelectedImage('signature');

    const result = await request('/settings', { method:'PUT', body:JSON.stringify({
      shop_name_th: $('#setting-shop-th').value,
      shop_name_en: $('#setting-shop-en').value,
      shop_owner: $('#setting-owner').value,
      shop_address: $('#setting-address').value,
      shop_tax_id: $('#setting-tax-id').value,
      shop_phone: $('#setting-phone').value,
      shop_email: $('#setting-email').value,
      scb_bank_details: $('#setting-scb').value,
      ktb_bank_details: $('#setting-ktb').value,
      logo_url: logoSource,
      saved_signature_url: signatureSource,
      numbering_config: collectNumberingConfig(),
      feature_flags: {
        realtime: $('#feature-realtime').checked,
        automatic_backup: $('#feature-auto-backup').checked,
        email_notifications: $('#feature-email').checked
      }
    }) });
    state.settings = result.data;
    applyBrand();
    showToast('บันทึกการตั้งค่าแล้ว');
  } catch (error) { showGlobalError(error); }
  finally { setBusy(button, false); }
});

async function loadUsers() {
  if (state.user.role !== 'admin') return;
  const result = await request('/users');
  $('#users-table').innerHTML = result.data.length
    ? result.data.map((u) => `<tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${ROLE_LABELS[u.role]}</td>
        <td>${u.active ? '<span class="status-badge status-PAID">ใช้งาน</span>' : '<span class="status-badge status-CANCELLED">ปิด</span>'}</td>
        <td><div class="table-actions">${u.active ? actionIcon({ icon:'key-round', title:'ตั้งรหัสผ่านใหม่', data:{'user-reset':u.id}, className:'action-edit' }) : ''}</div></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="table-empty">ยังไม่มีผู้ใช้งาน</td></tr>';

  $$('[data-user-reset]').forEach((button) => button.addEventListener('click', async () => {
    const user = result.data.find((item) => String(item.id) === button.dataset.userReset);
    const password = prompt(`ตั้งรหัสผ่านใหม่สำหรับ ${user?.name || 'ผู้ใช้'}\nอย่างน้อย 8 ตัว มี A-Z, a-z, ตัวเลข และอักขระพิเศษ`);
    if (password == null) return;
    const validationMessage = validatePassword(password);
    if (validationMessage) {
      alert(validationMessage);
      return;
    }
    if (!confirm(`ยืนยันตั้งรหัสผ่านใหม่ให้ ${user?.email || 'ผู้ใช้นี้'}?`)) return;
    try {
      await request(`/users/${button.dataset.userReset}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password })
      });
      showToast('ตั้งรหัสผ่านใหม่แล้ว');
    } catch (error) {
      showGlobalError(error);
    }
  }));
  refreshIcons();
}
$('#new-user-password').addEventListener('input', (event) => {
  renderPasswordRequirements(event.currentTarget.value);
  $('#password-error').classList.add('hidden');
});

$('#user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const password = $('#new-user-password').value;
  const passwordMessage = validatePassword(password);
  const passwordError = $('#password-error');
  renderPasswordRequirements(password, Boolean(passwordMessage));
  if (passwordMessage) {
    passwordError.textContent = passwordMessage;
    passwordError.classList.remove('hidden');
    $('#new-user-password').focus();
    return;
  }
  passwordError.classList.add('hidden');
  setBusy(button, true);
  try {
    await request('/users', { method:'POST', body:JSON.stringify({
      name: $('#new-user-name').value,
      email: $('#new-user-email').value,
      password,
      role: $('#new-user-role').value
    }) });
    event.currentTarget.reset();
    renderPasswordRequirements('');
    await loadUsers();
    showToast('เพิ่มผู้ใช้งานแล้ว');
  } catch (error) {
    const passwordDetail = error.details?.find((detail) => detail.path === 'password');
    if (passwordDetail) {
      passwordError.textContent = passwordDetail.message;
      passwordError.classList.remove('hidden');
      renderPasswordRequirements(password, true);
    } else {
      showGlobalError(error);
    }
  } finally { setBusy(button, false); }
});

$('#backup-button').addEventListener('click', async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/backup/export`, { headers:{ Authorization:`Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('สำรองข้อมูลไม่สำเร็จ');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tong-billing-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลดข้อมูลสำรองแล้ว');
  } catch (error) { showGlobalError(error); }
});

$$('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#document-filter-button').addEventListener('click', () => loadDocuments().catch(showGlobalError));

$('#trash-toggle').addEventListener('click', async () => {
  state.documentsTrashMode = !state.documentsTrashMode;
  $('#document-status-filter').value = '';
  try { await loadDocuments(); } catch (error) { showGlobalError(error); }
});
$('#dashboard-period').addEventListener('change', () => loadDashboard().catch(showGlobalError));
window.addEventListener('themechange', () => {
  if (state.dashboardAnalytics) renderDashboardCharts();
  if (state.reportChartData) renderReportCharts();
});
$('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#user-menu-button').addEventListener('click', () => $('#user-menu').classList.toggle('hidden'));
$('#logout-button').addEventListener('click', () => { clearToken(); location.replace('./index.html'); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#audit-modal').classList.contains('hidden')) closeAuditModal();
  else if (event.key === 'Escape' && !$('#document-modal').classList.contains('hidden')) closeDocumentModal();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#document-search').focus(); switchView('documents'); }
});

refreshIcons();
loadInitialData().catch((error) => {
  if (error.status === 401) { clearToken(); location.replace('./index.html'); }
  else showGlobalError(error);
});
