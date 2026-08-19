export const ADMIN_DEMO_PHONE = '2000000000';
export const ADMIN_DEMO_PIN = '1804';

export function normalizePhone(value) {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('856')) p = p.slice(3);
  if (p.startsWith('0') && p.length > 8) p = p.slice(1);
  return p;
}

/** GitHub Pages / static hosts have no live API unless VITE_LIVE_URL is set */
export function isStaticPreview() {
  if (import.meta.env.VITE_LIVE_URL) return false;
  const h = window.location.hostname;
  return (
    h.endsWith('github.io') ||
    h.endsWith('gitlab.io') ||
    h.endsWith('netlify.app') ||
    h.endsWith('vercel.app')
  );
}

export function liveBase() {
  const env = import.meta.env.VITE_LIVE_URL;
  if (env) return String(env).replace(/\/$/, '');
  if (isStaticPreview()) return '';
  const { protocol, hostname, port } = window.location;
  if (port === '5180' || port === '4180') return '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `${protocol}//${hostname}:8787`;
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

function sessionKey() {
  return window.__IDRIVE_SESSION_KEY || 'idrive_live_session_v1';
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey()) || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (!session) localStorage.removeItem(sessionKey());
  else localStorage.setItem(sessionKey(), JSON.stringify(session));
}

export function isLive() {
  return !!window.__idriveLive?.connected;
}

export function currentUser() {
  return window.__idriveLive?.user || getSession()?.user || null;
}
