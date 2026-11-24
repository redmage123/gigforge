const BASE = '';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : '';
}

// The portfolio selected in the top bar ("all" = own portfolios combined). Sent with every request
// so portfolio-aware endpoints (trades, P&L, risk, performance, import) follow the switcher.
let portfolioScope = 'all';
export const setPortfolioScope = (id) => { portfolioScope = id || 'all'; };
export const getPortfolioScope = () => portfolioScope;

async function request(path, options = {}) {
  const method = options.method || 'GET';
  // FormData sets its own multipart Content-Type (with boundary)
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-Portfolio': portfolioScope, ...options.headers };

  // Attach CSRF token for state-changing requests
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers['X-CSRF-Token'] = getCookie('csrf_token');
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  // Ensure we got JSON back, not HTML (SPA catch-all)
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON but got ${contentType || 'unknown'} from ${path}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // The user's firm requires two-factor authentication and they haven't set it up yet
    if (res.status === 403 && body.mfa_enrollment_required && window.location.pathname !== '/mfa-setup') {
      window.location.href = '/mfa-setup';
    }
    // FastAPI validation errors arrive as {detail: [{loc, msg}, ...]}
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d) => `${(d.loc || []).slice(-1)[0] || 'field'}: ${d.msg}`).join('; ')
      : body.detail;
    throw new Error(body.error || body.message || detail || `${res.status} ${res.statusText}`);
  }

  return res.json();
}

// For the few raw fetch() calls: the API rejects POST/PUT/DELETE without this header
export const csrfHeader = () => ({ 'X-CSRF-Token': getCookie('csrf_token') });

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),
};
