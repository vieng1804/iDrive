import { liveBase, getSession, setSession, currentUser } from './session.js';

const listeners = new Set();

const state = {
  connected: false,
  reachable: false,
  user: null,
  driver: null,
  token: null,
  orders: [],
  drivers: [],
  messages: [],
  lastError: null
};

let ws = null;
let pingTimer = null;

export function getLiveState() {
  return state;
}

export function onLive(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  window.__idriveLive = {
    connected: state.connected,
    reachable: state.reachable,
    user: state.user,
    driver: state.driver
  };
  listeners.forEach((fn) => fn(state));
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const auth = token || state.token || getSession()?.token;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${liveBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function probeLive() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1800);
    const res = await fetch(`${liveBase()}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    state.reachable = res.ok;
  } catch {
    state.reachable = false;
  }
  emit();
  return state.reachable;
}

export async function connectLive() {
  await probeLive();
  const session = getSession();
  if (state.reachable && session?.token) {
    try {
      const me = await api('/api/me', { token: session.token });
      applyAuth(session.token, me.user, me.driver);
      applySnapshot(me.snapshot);
      openSocket();
    } catch {
      setSession(null);
      state.token = null;
      state.user = null;
    }
  }
  emit();
  return state;
}

export async function liveLogin({ phone, name, pin }) {
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: { phone, name, pin }
  });
  applyAuth(data.token, data.user, data.driver);
  setSession({ token: data.token, user: data.user });
  const snap = await api('/api/snapshot');
  applySnapshot(snap);
  openSocket();
  emit();
  return data.user;
}

export async function liveLogout() {
  try {
    if (state.token) await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  closeSocket();
  setSession(null);
  state.token = null;
  state.user = null;
  state.driver = null;
  state.connected = false;
  state.orders = [];
  emit();
}

function applyAuth(token, user, driver) {
  state.token = token;
  state.user = user;
  state.driver = driver || null;
  window.__idriveLive = { ...window.__idriveLive, user, driver, connected: true };
}

function applySnapshot(snap) {
  if (!snap) return;
  state.orders = snap.orders || [];
  state.drivers = snap.drivers || [];
  state.messages = snap.messages || [];
  if (snap.me) state.user = snap.me;
  if (snap.driver !== undefined) state.driver = snap.driver;
}

function openSocket() {
  closeSocket();
  const base = liveBase();
  const wsBase = base ? base.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  ws = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(state.token)}`);
  ws.addEventListener('open', () => {
    state.connected = true;
    emit();
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleEvent(msg);
    } catch {
      /* ignore */
    }
  });
  ws.addEventListener('close', () => {
    state.connected = false;
    emit();
    if (state.token) setTimeout(openSocket, 2000);
  });
  pingTimer = setInterval(() => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }, 20000);
}

function closeSocket() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

function handleEvent(msg) {
  if (msg.type === 'hello') {
    applySnapshot(msg.payload);
    emit();
    return;
  }
  if (msg.type === 'order') {
    upsert(state.orders, msg.payload);
    emit();
    return;
  }
  if (msg.type === 'driver') {
    if (msg.payload?.userId === currentUser()?.id || msg.payload?.id === currentUser()?.id) {
      state.driver = msg.payload;
    }
    const list = state.drivers;
    const i = list.findIndex((d) => d.id === msg.payload.id);
    if (msg.payload.online) {
      if (i >= 0) list[i] = msg.payload;
      else list.push(msg.payload);
    } else if (i >= 0) list.splice(i, 1);
    emit();
    return;
  }
  if (msg.type === 'location') {
    const p = msg.payload || {};
    const id = p.id || p.userId;
    if (!id || p.lat == null || p.lng == null) return;
    const list = state.drivers;
    const i = list.findIndex((x) => x.id === id || x.userId === id);
    if (i >= 0) {
      list[i] = { ...list[i], ...p, id: list[i].id || id, lat: p.lat, lng: p.lng, online: true };
    } else {
      list.push({ ...p, id, online: true });
    }
    if (state.driver?.id === id || state.driver?.userId === id) {
      state.driver = { ...state.driver, lat: p.lat, lng: p.lng };
    }
    emit();
    return;
  }
  if (msg.type === 'chat') {
    state.messages.push(msg.payload);
    emit();
  }
}

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.unshift(item);
}

export function dbView() {
  const active =
    state.orders.find(
      (o) =>
        (o.passengerId === state.user?.id || o.driverId === state.user?.id) &&
        ['open', 'bidding', 'matched'].includes(o.status)
    ) || null;
  return {
    orders: state.orders,
    activeOrderId: active?.id || null,
    wallet: 0,
    earnings: state.driver?.earnings || 0,
    tripsDone: state.driver?.trips || state.user?.trips || 0,
    driverRating: Number(state.driver?.rating || 4.95),
    history: state.orders
      .filter((o) => o.status === 'completed' && (o.passengerId === state.user?.id || o.driverId === state.user?.id))
      .map((o) => ({
        id: o.id,
        at: o.completedAt,
        route: `${short(o.pickup?.name)} ➔ ${short(o.dest?.name)}`,
        driver: o.acceptedBid?.name || '—',
        fare: o.finalFare || o.offerFare,
        payment: o.payment,
        rating: o.rating,
        distance: o.distance
      })),
    user: state.user
  };
}

function short(n = '') {
  return n.length > 22 ? `${n.slice(0, 20)}…` : n;
}
