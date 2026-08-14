/** localStorage persistence for InDrive-like live marketplace */

const KEY = 'idrive_lao_v8';

const DEFAULT = {
  wallet: 350000,
  earnings: 0,
  tripsDone: 0,
  driverRating: 4.95,
  history: [],
  orders: [],
  activeOrderId: null,
  chat: [],
  onboardingDone: false,
  loggedIn: false,
  user: null,
  notifications: [],
  settings: { sound: true, notif: true },
  driverApply: null
};

export function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function saveDB(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent('idrive:db', { detail: db }));
}

export function patchDB(mutator) {
  const db = loadDB();
  mutator(db);
  saveDB(db);
  return db;
}

export function uid(prefix = 'ord') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
