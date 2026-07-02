const THEME_STORAGE_KEY = 'tong_billing_theme';
const CIRCUIT_ENABLED_KEY = 'tong_billing_circuit_enabled';
const CIRCUIT_INTENSITY_KEY = 'tong_billing_circuit_intensity';

export const THEMES = Object.freeze({
  dark: 'กรมท่าเข้ม',
  light: 'สว่าง',
  amber: 'อำพันอบอุ่น',
  softgreen: 'เขียวอ่อน',
  ocean: 'ฟ้ามหาสมุทร',
  lavender: 'ม่วงลาเวนเดอร์',
  rose: 'ชมพูกุหลาบอ่อน'
});

function getStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Browser storage may be blocked.
  }
}

function normalizeTheme(theme) {
  return Object.hasOwn(THEMES, theme) ? theme : 'dark';
}

function normalizeIntensity(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 18;
  return Math.min(30, Math.max(0, Math.round(numberValue)));
}

function syncThemeControls(theme) {
  document.querySelectorAll('[data-theme-select]').forEach((control) => {
    if (control.value !== theme) control.value = theme;
  });
}

function syncCircuitControls({ enabled, intensity }) {
  document.querySelectorAll('[data-circuit-toggle]').forEach((control) => {
    control.checked = enabled;
  });

  document.querySelectorAll('[data-circuit-intensity]').forEach((control) => {
    control.value = String(intensity);
    control.disabled = !enabled;
  });

  document.querySelectorAll('[data-circuit-value]').forEach((element) => {
    element.textContent = `${intensity}%`;
  });

  document.querySelectorAll('[data-circuit-preset]').forEach((button) => {
    button.classList.toggle(
      'active',
      enabled && Number(button.dataset.circuitPreset) === intensity
    );
  });

  document.querySelectorAll('[data-circuit-quick-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('active', enabled);
    button.title = enabled
      ? `ลายวงจรเปิดอยู่ (${intensity}%)`
      : 'ลายวงจรถูกปิด';
  });
}

export function applyTheme(theme, { persist = true } = {}) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  window.dispatchEvent(
    new CustomEvent('themechange', { detail: { theme: nextTheme } })
  );

  if (persist) setStoredValue(THEME_STORAGE_KEY, nextTheme);
  syncThemeControls(nextTheme);
  return nextTheme;
}

export function getCircuitPreferences() {
  const storedEnabled = getStoredValue(CIRCUIT_ENABLED_KEY);
  const storedIntensity = getStoredValue(CIRCUIT_INTENSITY_KEY);

  return {
    enabled: storedEnabled === null ? true : storedEnabled === 'true',
    intensity: normalizeIntensity(storedIntensity === null ? 18 : storedIntensity)
  };
}

export function applyCircuitPreferences(
  { enabled, intensity },
  { persist = true } = {}
) {
  const normalized = {
    enabled: Boolean(enabled),
    intensity: normalizeIntensity(intensity)
  };

  document.documentElement.dataset.circuit = normalized.enabled ? 'on' : 'off';
  document.documentElement.style.setProperty(
    '--circuit-user-opacity',
    String(normalized.intensity / 100)
  );

  if (persist) {
    setStoredValue(CIRCUIT_ENABLED_KEY, normalized.enabled);
    setStoredValue(CIRCUIT_INTENSITY_KEY, normalized.intensity);
  }

  syncCircuitControls(normalized);
  window.dispatchEvent(
    new CustomEvent('circuitbackgroundchange', { detail: normalized })
  );

  return normalized;
}

function closeCircuitMenus(except = null) {
  document.querySelectorAll('[data-circuit-menu]').forEach((menu) => {
    if (menu !== except) menu.classList.add('hidden');
  });
}

function bindCircuitControls() {
  document.querySelectorAll('[data-circuit-toggle]').forEach((control) => {
    control.addEventListener('change', () => {
      const current = getCircuitPreferences();
      applyCircuitPreferences({
        enabled: control.checked,
        intensity: current.intensity
      });
    });
  });

  document.querySelectorAll('[data-circuit-intensity]').forEach((control) => {
    control.addEventListener('input', () => {
      applyCircuitPreferences({
        enabled: true,
        intensity: control.value
      });
    });
  });

  document.querySelectorAll('[data-circuit-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      applyCircuitPreferences({
        enabled: true,
        intensity: button.dataset.circuitPreset
      });
    });
  });

  document.querySelectorAll('[data-circuit-quick-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = getCircuitPreferences();
      applyCircuitPreferences({
        enabled: !current.enabled,
        intensity: current.intensity
      });
    });
  });

  document.querySelectorAll('[data-circuit-menu-button]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const wrap = button.closest('[data-circuit-menu-wrap]');
      const menu = wrap?.querySelector('[data-circuit-menu]');
      if (!menu) return;

      const willOpen = menu.classList.contains('hidden');
      closeCircuitMenus(willOpen ? menu : null);
      menu.classList.toggle('hidden', !willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });
  });

  document.querySelectorAll('[data-circuit-menu]').forEach((menu) => {
    menu.addEventListener('click', (event) => event.stopPropagation());
  });

  document.addEventListener('click', () => closeCircuitMenus());
}

export function initTheme() {
  const initialTheme = applyTheme(
    getStoredValue(THEME_STORAGE_KEY) || 'dark',
    { persist: false }
  );

  document.querySelectorAll('[data-theme-select]').forEach((control) => {
    control.value = initialTheme;
    control.addEventListener('change', (event) => {
      applyTheme(event.currentTarget.value);
    });
  });

  applyCircuitPreferences(getCircuitPreferences(), { persist: false });
  bindCircuitControls();

  return initialTheme;
}
