// Talks to Supabase over plain REST. Works offline: events wait in a queue.

const cfg = window.READIT_CONFIG || {};
export const online = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
const QKEY = 'readit.queue.v1';

async function rpc(fn, args, token) {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // Only a signed-in teacher sends a Bearer token; students go by the public key alone
    // (works with both the legacy "anon" JWT and the new "sb_publishable_" keys).
    headers: { apikey: cfg.supabaseAnonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- student side ---------- */

export async function join(code) {
  if (!online) return null;
  return rpc('join_student', { p_code: code });
}

export async function restore(code) {
  if (!online) return null;
  return rpc('get_progress', { p_code: code });
}

export async function assignments(code) {
  // Demo mode: tasks the teacher page saved on this same device.
  if (!online) { try { return JSON.parse(localStorage.getItem('readit.demo.assignments')) || []; } catch { return []; } }
  if (!code) return [];
  try { return await rpc('get_assignments', { p_code: code }); } catch { return []; }
}

function queue() { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch { return []; } }
function setQueue(q) { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-300))); } catch { /* ignore */ } }

export function logEvent(code, kind, payload) {
  if (!online || !code) return;
  setQueue([...queue(), { kind, payload, at: new Date().toISOString() }]);
  flush(code);
}

let pending = null;
export function pushProgress(code, data) {
  if (!online || !code) return;
  clearTimeout(pending);
  pending = setTimeout(() => rpc('save_progress', { p_code: code, p_data: data }).catch(() => {}), 800);
}

let flushing = false;
export async function flush(code) {
  if (!online || !code || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let q = queue();
    while (q.length) {
      const e = q[0];
      await rpc('log_event', { p_code: code, p_kind: e.kind, p_payload: e.payload, p_at: e.at });
      q = queue().slice(1);
      setQueue(q);
    }
  } catch { /* try again later */ } finally { flushing = false; }
}

/* ---------- teacher side ---------- */

const TKEY = 'readit.teacher.v1';

export function teacherSession() { try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return null; } }

export async function signIn(email, password) {
  const r = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.msg || 'Не получилось войти');
  const s = { token: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000, email };
  localStorage.setItem(TKEY, JSON.stringify(s));
  return s;
}

export function signOut() { localStorage.removeItem(TKEY); }

async function token() {
  const s = teacherSession();
  if (!s) throw new Error('auth');
  if (Date.now() < s.exp - 60000) return s.token;
  const r = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh }),
  });
  const j = await r.json();
  if (!r.ok) { signOut(); throw new Error('auth'); }
  const n = { ...s, token: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000 };
  localStorage.setItem(TKEY, JSON.stringify(n));
  return n.token;
}

export async function rest(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { signOut(); throw new Error('auth'); }
  if (!r.ok) throw new Error(await r.text());
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
