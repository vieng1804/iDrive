/** JSON store with serialized writes — good for a same-day live ops MVP. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { docStatus } from './kyc.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'idrive.json');

const DEFAULT = () => ({
  users: [],
  sessions: [],
  drivers: [],
  orders: [],
  messages: [],
  events: []
});

function load() {
  if (!existsSync(DATA_FILE)) return DEFAULT();
  try {
    return { ...DEFAULT(), ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return DEFAULT();
  }
}

function save(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let queue = Promise.resolve();

export function tx(mutator) {
  const run = queue.then(async () => {
    const data = load();
    const result = await mutator(data);
    save(data);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function read() {
  return load();
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(pin), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPin(pin, salt, hash) {
  try {
    const next = scryptSync(String(pin), salt, 32);
    const prev = Buffer.from(hash, 'hex');
    if (prev.length !== next.length) return false;
    return timingSafeEqual(prev, next);
  } catch {
    return false;
  }
}

export function sha(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function now() {
  return Date.now();
}

export function logEvent(data, type, payload = {}) {
  data.events.unshift({ id: uid('evt'), type, at: now(), ...payload });
  if (data.events.length > 500) data.events.length = 500;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    rating: user.rating,
    trips: user.trips,
    createdAt: user.createdAt
  };
}

export function driverCard(driver, user, { kyc = false } = {}) {
  if (!driver) return null;
  const name = driver.name || user?.name || 'ຄົນຂັບ';
  const car = [driver.brand, driver.model].filter(Boolean).join(' ') || 'ລົດ iDrive';
  const plate = driver.plate ? ` • ${driver.plate}` : '';
  const card = {
    id: driver.userId,
    userId: driver.userId,
    name,
    car: `${car}${plate}`,
    rating: Number(driver.rating || user?.rating || 4.9).toFixed(2),
    img:
      driver.img ||
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    eta: driver.eta || '—',
    status: driver.status,
    online: !!driver.online,
    lat: driver.lat,
    lng: driver.lng,
    lastSeen: driver.lastSeen,
    vehicleType: driver.vehicleType,
    plate: driver.plate,
    city: driver.city,
    earnings: driver.earnings || 0,
    trips: driver.trips || 0,
    phone: driver.phone || user?.phone
  };
  if (kyc) {
    card.brand = driver.brand || '';
    card.model = driver.model || '';
    card.color = driver.color || '';
    card.year = driver.year || '';
    card.idType = driver.idType || 'idcard';
    card.idNumber = driver.idNumber || '';
    card.licenseNumber = driver.licenseNumber || '';
    card.docs = driver.docs || {};
    card.docStatus = docStatus(driver);
    card.rejectReason = driver.rejectReason || '';
    card.submittedAt = driver.submittedAt || null;
    card.approvedAt = driver.approvedAt || null;
  }
  return card;
}

export function shapeOrder(order, data) {
  if (!order) return null;
  const passenger = data.users.find((u) => u.id === order.passengerId);
  const driver = data.drivers.find((d) => d.userId === order.driverId);
  const driverUser = data.users.find((u) => u.id === order.driverId);
  const bids = (order.bids || []).map((b) => {
    const d = data.drivers.find((x) => x.userId === b.driverId);
    const u = data.users.find((x) => x.id === b.driverId);
    return {
      ...b,
      ...driverCard(d, u),
      driverId: b.driverId,
      price: b.price,
      type: b.type,
      at: b.at,
      eta: b.eta || etaLabel(d, order.pickup)
    };
  });
  const acceptedBid = order.acceptedBidId
    ? bids.find((b) => b.driverId === order.acceptedBidId) || order.acceptedBid
    : order.acceptedBid || null;
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    passengerId: order.passengerId,
    passengerName: passenger?.name || order.passengerName || 'ຜູ້ໂດຍສານ',
    pickup: order.pickup,
    dest: order.dest,
    offerFare: order.offerFare,
    vehicle: order.vehicle,
    payment: order.payment,
    note: order.note || '',
    distance: order.distance,
    duration: order.duration,
    bids,
    acceptedBid,
    phase: order.phase,
    driverId: order.driverId,
    finalFare: order.finalFare,
    rating: order.rating,
    review: order.review,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt
  };
}

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function etaLabel(driver, pickup) {
  const km = haversineKm(driver, pickup);
  if (km == null) return '—';
  const mins = Math.max(1, Math.round((km / 22) * 60));
  return `${mins} ນທ`;
}
