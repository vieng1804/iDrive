import { api, dbView, getLiveState, onLive } from './client.js';
import { isLive, currentUser } from './session.js';

export { isLive };

export function liveDb() {
  return dbView();
}

export function onLiveMarket(fn) {
  return onLive(() => fn(dbView()));
}

export function getOpenOrders() {
  const me = currentUser()?.id;
  return getLiveState().orders.filter(
    (o) =>
      (o.status === 'open' || o.status === 'bidding') &&
      o.passengerId !== me
  );
}

export function getOrder(id) {
  return getLiveState().orders.find((o) => o.id === id) || null;
}

export function getActiveOrder() {
  const me = currentUser()?.id;
  return (
    getLiveState().orders.find(
      (o) =>
        (o.passengerId === me || o.driverId === me) &&
        ['open', 'bidding', 'matched'].includes(o.status)
    ) || null
  );
}

export async function createPassengerOrder(payload) {
  const { order } = await api('/api/orders', {
    method: 'POST',
    body: payload
  });
  return order;
}

export async function cancelOrder(orderId) {
  await api(`/api/orders/${orderId}/cancel`, { method: 'POST' });
}

export async function addBid(orderId, bid) {
  const { order } = await api(`/api/orders/${orderId}/bids`, {
    method: 'POST',
    body: {
      price: bid.price,
      type: bid.type,
      eta: bid.eta
    }
  });
  return order;
}

export async function acceptBid(orderId, driverId) {
  const { order } = await api(`/api/orders/${orderId}/accept`, {
    method: 'POST',
    body: { driverId }
  });
  return order;
}

export async function driverAcceptOffer(orderId) {
  const { order } = await api(`/api/orders/${orderId}/take`, { method: 'POST' });
  return order;
}

export async function driverCounterOffer(orderId, price) {
  return addBid(orderId, { price, type: 'counter' });
}

export async function setTripPhase(orderId, phase) {
  await api(`/api/orders/${orderId}/phase`, {
    method: 'POST',
    body: { phase }
  });
}

export async function completeOrder(orderId, { rating = 5, review = '' } = {}) {
  const { order } = await api(`/api/orders/${orderId}/complete`, {
    method: 'POST',
    body: { rating, review }
  });
  return order;
}

export function getMeAsDriver() {
  const d = getLiveState().driver;
  const u = currentUser();
  if (!d) {
    return {
      id: u?.id,
      name: u?.name || 'ຂ້ອຍ',
      car: 'ລົດ iDrive',
      rating: '4.95',
      img: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
      eta: '2 ນທ'
    };
  }
  return d;
}

export async function submitDriverApplication(data) {
  const { driver } = await api('/api/driver/apply', { method: 'POST', body: data });
  return driver;
}

export async function uploadKycDoc(slot, image) {
  const { driver } = await api('/api/driver/docs', {
    method: 'POST',
    body: { slot, image }
  });
  return driver;
}

export function kycDocUrl(userId, slot) {
  const token = getLiveState().token || '';
  const t = encodeURIComponent(token);
  const u = encodeURIComponent(userId);
  const s = encodeURIComponent(slot);
  return `/api/driver/docs/${u}/${s}?token=${t}`;
}

export async function setDriverOnline(online, coords) {
  const { driver } = await api('/api/driver/online', {
    method: 'POST',
    body: { online, lat: coords?.lat, lng: coords?.lng }
  });
  return driver;
}

export async function pingLocation(lat, lng) {
  await api('/api/driver/location', { method: 'POST', body: { lat, lng } });
}

export async function sendLiveChat(orderId, text) {
  const { message } = await api(`/api/orders/${orderId}/chat`, {
    method: 'POST',
    body: { text }
  });
  return message;
}

export function chatFor(orderId) {
  return getLiveState().messages.filter((m) => m.orderId === orderId);
}

export async function fetchAdminOverview() {
  return api('/api/admin/overview');
}

export async function adminSetDriver(userId, reject = false, note = '') {
  return api(`/api/admin/drivers/${userId}/approve`, {
    method: 'POST',
    body: { reject, note }
  });
}

export async function adminCancelOrder(orderId) {
  return api(`/api/admin/orders/${orderId}/cancel`, { method: 'POST' });
}
