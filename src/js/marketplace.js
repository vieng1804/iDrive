/** InDrive-style live order marketplace (passenger ↔ driver negotiation) */
import { DRIVERS } from './data/locations.js';
import { loadDB, patchDB, uid } from './persist.js';
import { isLive } from './live/session.js';
import * as live from './live/market.js';

const listeners = new Set();

export function onMarket(fn) {
  if (isLive()) return live.onLiveMarket(fn);
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const db = loadDB();
  listeners.forEach((fn) => fn(db));
}

export function getOpenOrders() {
  if (isLive()) return live.getOpenOrders();
  return loadDB().orders.filter((o) => o.status === 'open' || o.status === 'bidding');
}

export function getOrder(id) {
  if (isLive()) return live.getOrder(id);
  return loadDB().orders.find((o) => o.id === id) || null;
}

export function getActiveOrder() {
  if (isLive()) return live.getActiveOrder();
  const db = loadDB();
  if (!db.activeOrderId) return null;
  return db.orders.find((o) => o.id === db.activeOrderId) || null;
}

export function createPassengerOrder({
  pickup,
  dest,
  fare,
  vehicle,
  payment,
  note,
  distance,
  duration,
  passengerName = 'ທ່ານ ສົມພອນ'
}) {
  if (isLive()) {
    return live.createPassengerOrder({
      pickup,
      dest,
      fare,
      vehicle,
      payment,
      note,
      distance,
      duration,
      passengerName
    });
  }
  const order = {
    id: uid('ord'),
    status: 'open',
    createdAt: Date.now(),
    passengerName,
    pickup,
    dest,
    offerFare: fare,
    vehicle,
    payment,
    note: note || '',
    distance,
    duration,
    bids: [],
    acceptedBid: null,
    phase: null, // to_pickup | waiting | onboard | arrived
    driverId: null
  };

  patchDB((db) => {
    db.orders = [order, ...db.orders.filter((o) => o.status === 'open' || o.status === 'bidding')];
    db.activeOrderId = order.id;
  });
  emit();
  return order;
}

export function cancelOrder(orderId) {
  if (isLive()) return live.cancelOrder(orderId);
  patchDB((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (o && (o.status === 'open' || o.status === 'bidding')) {
      o.status = 'cancelled';
    }
    if (db.activeOrderId === orderId) db.activeOrderId = null;
  });
  emit();
}

export function addBid(orderId, bid) {
  if (isLive()) return live.addBid(orderId, bid);
  let saved = null;
  patchDB((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o || (o.status !== 'open' && o.status !== 'bidding')) return;
    o.status = 'bidding';
    const existing = o.bids.findIndex((b) => b.driverId === bid.driverId);
    if (existing >= 0) o.bids[existing] = bid;
    else o.bids.push(bid);
    o.bids.sort((a, b) => a.price - b.price);
    saved = { ...o };
  });
  emit();
  return saved;
}

export function passengerCounter(orderId, driverId, newPrice) {
  return addBid(orderId, {
    ...getOrder(orderId)?.bids.find((b) => b.driverId === driverId),
    price: newPrice,
    type: 'passenger_counter',
    at: Date.now()
  });
}

export function acceptBid(orderId, driverId) {
  if (isLive()) return live.acceptBid(orderId, driverId);
  let result = null;
  patchDB((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return;
    const bid = o.bids.find((b) => String(b.driverId) === String(driverId));
    if (!bid) return;
    o.status = 'matched';
    o.acceptedBid = bid;
    o.driverId = bid.driverId;
    o.phase = 'to_pickup';
    o.finalFare = bid.price;
    db.activeOrderId = o.id;
    // close other open orders from same passenger session
    db.orders.forEach((x) => {
      if (x.id !== orderId && (x.status === 'open' || x.status === 'bidding')) {
        x.status = 'expired';
      }
    });
    result = { ...o };
  });
  emit();
  return result;
}

/** Driver accepts passenger's offered fare as-is */
export function driverAcceptOffer(orderId, driver) {
  if (isLive()) return live.driverAcceptOffer(orderId);
  addBid(orderId, {
    driverId: driver.id,
    name: driver.name,
    car: driver.car,
    rating: driver.rating,
    img: driver.img,
    eta: driver.eta || '3 ນທ',
    price: getOrder(orderId).offerFare,
    type: 'accept',
    at: Date.now()
  });
  return acceptBid(orderId, driver.id);
}

/** Driver sends counter-offer */
export function driverCounterOffer(orderId, driver, price) {
  if (isLive()) return live.driverCounterOffer(orderId, price);
  return addBid(orderId, {
    driverId: driver.id,
    name: driver.name,
    car: driver.car,
    rating: driver.rating,
    img: driver.img,
    eta: driver.eta || '4 ນທ',
    price,
    type: 'counter',
    at: Date.now()
  });
}

export function setTripPhase(orderId, phase) {
  if (isLive()) return live.setTripPhase(orderId, phase);
  patchDB((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (o) o.phase = phase;
  });
  emit();
}

export function completeOrder(orderId, { rating = 5, review = '' } = {}) {
  if (isLive()) return live.completeOrder(orderId, { rating, review });
  let done = null;
  patchDB((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return;
    o.status = 'completed';
    o.phase = 'done';
    o.rating = rating;
    o.review = review;
    o.completedAt = Date.now();

    const fare = o.finalFare || o.offerFare;
    if (o.payment === 'BCEL One' || o.payment === 'iDrive Wallet') {
      db.wallet = Math.max(0, (db.wallet || 0) - fare);
    }
    db.earnings = (db.earnings || 0) + fare;
    db.tripsDone = (db.tripsDone || 0) + 1;
    if (rating) {
      const prev = db.driverRating || 4.95;
      db.driverRating = Number(((prev * Math.max(1, db.tripsDone - 1) + rating) / db.tripsDone).toFixed(2));
    }

    db.history.unshift({
      id: o.id,
      at: o.completedAt,
      route: `${shortName(o.pickup?.name)} ➔ ${shortName(o.dest?.name)}`,
      driver: o.acceptedBid?.name || '—',
      fare,
      payment: o.payment,
      rating,
      distance: o.distance
    });
    if (db.history.length > 30) db.history.length = 30;
    if (db.activeOrderId === orderId) db.activeOrderId = null;
    done = { ...o, fare };
  });
  emit();
  return done;
}

function shortName(n = '') {
  return n.length > 22 ? `${n.slice(0, 20)}…` : n;
}

/** Simulate nearby bot drivers bidding like real InDrive */
export function spawnBotBids(orderId, onBid) {
  if (isLive()) return () => {};
  const timers = [];
  const order = getOrder(orderId);
  if (!order) return () => {};

  DRIVERS.forEach((d, i) => {
    const t = setTimeout(() => {
      const o = getOrder(orderId);
      if (!o || (o.status !== 'open' && o.status !== 'bidding')) return;

      // Mix of accept / slight counter / lower (competitive)
      const roll = Math.random();
      let price;
      let type;
      if (roll < 0.35) {
        price = o.offerFare;
        type = 'accept';
      } else if (roll < 0.7) {
        price = Math.ceil((o.offerFare * (1.05 + Math.random() * 0.2)) / 1000) * 1000;
        type = 'counter';
      } else {
        price = Math.ceil((o.offerFare * (0.85 + Math.random() * 0.1)) / 1000) * 1000;
        type = 'accept';
      }
      price = Math.max(5000, price);

      const bid = {
        driverId: d.id,
        name: d.name,
        car: d.car,
        rating: d.rating,
        img: d.img,
        eta: d.eta,
        price,
        type,
        at: Date.now()
      };
      addBid(orderId, bid);
      if (onBid) onBid(bid, getOrder(orderId));
    }, 900 + i * 1400 + Math.random() * 600);
    timers.push(t);
  });

  return () => timers.forEach(clearTimeout);
}

export const ME_AS_DRIVER = {
  id: 'me_driver',
  name: 'ທ່ານ ສົມພອນ (ຂ້ອຍ)',
  car: 'Toyota Vios • ກຳ 9900',
  rating: '4.96',
  img: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
  eta: '1 ນທ'
};

export function getMeAsDriver() {
  if (isLive()) return live.getMeAsDriver();
  return ME_AS_DRIVER;
}
