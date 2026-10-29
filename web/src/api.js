const tg = () => window.Telegram?.WebApp;

async function request(base, method, path, body, headers = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + path, {
    method,
    headers: { ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Xato: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function appHeaders() {
  const init = tg()?.initData;
  return init ? { 'x-tg-init-data': init } : { 'x-dev-user': '1' };
}
export const appApi = {
  get: (p) => request('/api/app', 'GET', p, null, appHeaders()),
  post: (p, b) => request('/api/app', 'POST', p, b, appHeaders()),
};

export const adminToken = {
  get: () => { try { return localStorage.getItem('admin_token'); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem('admin_token', t) : localStorage.removeItem('admin_token'); } catch { /* */ } },
};
function adminHeaders() {
  return { authorization: `Bearer ${adminToken.get()}` };
}
async function adm(method, p, b) {
  try {
    return await request('/api/admin', method, p, b, adminHeaders());
  } catch (e) {
    if (e.status === 401 && !p.startsWith('/login')) {
      adminToken.set(null);
      window.dispatchEvent(new Event('admin-logout'));
    }
    throw e;
  }
}
export const adminApi = {
  get: (p) => adm('GET', p),
  post: (p, b) => adm('POST', p, b || {}),
  put: (p, b) => adm('PUT', p, b || {}),
  del: (p) => adm('DELETE', p),
  upload: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return adm('POST', '/upload', fd);
  },
  fileUrl: (p) => `/api/admin${p}${p.includes('?') ? '&' : '?'}t=${adminToken.get()}`,
};
