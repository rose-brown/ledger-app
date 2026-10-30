// 브라우저 전용: Google 로그인(Identity Services 토큰 모델) + Sheets API v4.
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_KEY = 'ledger.gtoken';

let client = null;

export function initGoogle(clientId) {
  return new Promise((resolve, reject) => {
    const done = () => {
      client = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} });
      resolve();
    };
    if (window.google?.accounts?.oauth2) return done();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = done;
    s.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했어요'));
    document.head.appendChild(s);
  });
}

function saved() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return t && t.exp > Date.now() + 60000 ? t.token : null;
  } catch { return null; }
}

// 저장된 토큰이 살아 있으면 그대로, 아니면 Google 창을 띄워 새로 받는다.
export function getToken(force = false) {
  const t = !force && saved();
  if (t) return Promise.resolve(t);
  return new Promise((resolve, reject) => {
    if (!client) return reject(new Error('Google 로그인이 준비되지 않았어요'));
    client.callback = r => {
      if (r.error) return reject(new Error(r.error_description || r.error));
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + r.expires_in * 1000 })); } catch {}
      resolve(r.access_token);
    };
    client.error_callback = e => reject(new Error(e?.message || '로그인 창이 닫혔어요'));
    client.requestAccessToken({ prompt: '' });
  });
}

export function signedIn() { return !!saved(); }

async function call(url, init = {}) {
  for (let i = 0; i < 2; i++) {
    const token = await getToken(i > 0);
    const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401 && i === 0) continue;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${body?.error?.message || ''}`);
    return body;
  }
}

const url = (id, a1, q) => `${API}/${encodeURIComponent(id)}/values/${encodeURIComponent(a1)}?${q}`;

// save.js가 쓰는 sheets 인터페이스
export const sheets = {
  async getValues(id, a1) {
    return (await call(url(id, a1, 'valueRenderOption=UNFORMATTED_VALUE'))).values || [];
  },
  async getFormula(id, a1) {
    return ((await call(url(id, a1, 'valueRenderOption=FORMULA'))).values || [[]])[0][0] || '';
  },
  async setValues(id, a1, values) {
    await call(url(id, a1, 'valueInputOption=RAW'), {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ range: a1, majorDimension: 'ROWS', values }),
    });
  },
};
