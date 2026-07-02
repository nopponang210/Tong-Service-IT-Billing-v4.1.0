import { request, setToken, getToken } from './api.js';
import { initTheme } from './theme.js';

initTheme();

async function loadPublicBranding() {
  const logo = document.getElementById('login-logo');
  const shopName = document.getElementById('login-shop-name');
  const shopSubtitle = document.getElementById('login-shop-subtitle');

  try {
    const result = await request('/settings/public-branding');
    const branding = result.data;
    if (!branding) return;

    if (branding.logo_url) {
      logo.src = branding.logo_url;
      logo.onerror = () => {
        logo.onerror = null;
        logo.src = './assets/logo-placeholder.svg';
      };
    }

    if (branding.shop_name_th) {
      shopName.textContent = branding.shop_name_th;
      document.title = `เข้าสู่ระบบ | ${branding.shop_name_th}`;
    }

    if (branding.shop_name_en) {
      shopSubtitle.textContent = branding.shop_name_en;
    }
  } catch (error) {
    console.warn('ไม่สามารถโหลดข้อมูลแบรนด์ได้:', error.message);
  }
}

loadPublicBranding();

if (getToken()) {
  request('/auth/me').then(() => location.replace('./app.html')).catch(() => {});
}

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const button = document.getElementById('login-button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
      })
    });
    setToken(result.token);
    location.replace('./app.html');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'เข้าสู่ระบบ';
  }
});
