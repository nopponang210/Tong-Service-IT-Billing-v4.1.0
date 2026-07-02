const API_BASE_URL = (window.APP_CONFIG?.API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const TOKEN_KEY = 'tong_billing_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(`เชื่อมต่อ Backend ไม่สำเร็จ (${API_BASE_URL})`);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) clearToken();
    const message = data?.error?.message || data || `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

export { API_BASE_URL };
