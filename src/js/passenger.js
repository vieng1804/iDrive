/** Passenger booking + InDrive fare negotiation */
import { ST } from './state.js';
import { recommendFare, applyRecommendedFare } from './fare.js';
import { SERVICES } from './data/locations.js';
import { show, toast, openModal, closeModal } from './ui.js';
import {
  placePickup,
  placeDest,
  calcRoute,
  animateDriver,
  stopDriverAnim
} from './map.js';
import {
  createPassengerOrder,
  cancelOrder,
  acceptBid,
  addBid,
  spawnBotBids,
  getOrder,
  getActiveOrder,
  completeOrder,
  setTripPhase,
  onMarket
} from './marketplace.js';
import { loadDB } from './persist.js';
import { resetChat, setChatPeer } from './chat.js';
import { refreshWalletUI } from './wallet.js';
import { renderHistory } from './history.js';

let stopBots = null;
let unsub = null;
let lastTripPhase = null;
ST.pendingRating = 5;

function setCompleteTripReady(ready) {
  const btn = document.getElementById('complete-trip-btn');
  if (!btn) return;
  btn.disabled = !ready;
  btn.classList.toggle('is-ready', !!ready);
  btn.textContent = ready
    ? 'ສຳເລັດທ່ຽວ — ຊຳລະ & ໃຫ້ຄະແນນ'
    : 'ລໍຖ້າຮອດຈຸດໝາຍ...';
}

export function setSvc(svc) {
  ST.service = svc;
  document.querySelectorAll('.svc-pill').forEach((p) => {
    p.classList.remove('border-idrive-green', 'text-white', 'glow-green-sm');
    p.classList.add('border-idrive-border', 'text-gray-300');
  });
  const pill = document.getElementById(`pill-${svc}`);
  if (pill) {
    pill.classList.add('border-idrive-green', 'text-white', 'glow-green-sm');
    pill.classList.remove('border-idrive-border', 'text-gray-300');
  }
  const s = SERVICES[svc];
  if (!s) return;
  ST.pickup = { lat: s.pLat, lng: s.pLng, name: s.p };
  ST.dest = { lat: s.dLat, lng: s.dLng, name: s.d };
  document.getElementById('pickup-input').value = s.p;
  document.getElementById('dest-input').value = s.d;
  placePickup(s.pLat, s.pLng);
  placeDest(s.dLat, s.dLng);
  calcRoute();
  window.syncLocSummary?.();
  toast(`ບໍລິການ: ${svc.toUpperCase()}`);
}

export function selectVehicle(type, baseFare) {
  ST.vehicle = type;
  document.querySelectorAll('.veh-btn').forEach((b) => {
    b.classList.remove(
      'border-2',
      'border-idrive-green',
      'bg-idrive-accent',
      'glow-green-sm'
    );
    b.classList.add('border', 'border-idrive-border', 'bg-idrive-dark');
  });
  const btn = document.getElementById(`v-${type}`);
  if (btn) {
    btn.classList.remove('border', 'border-idrive-border', 'bg-idrive-dark');
    btn.classList.add(
      'border-2',
      'border-idrive-green',
      'bg-idrive-accent',
      'glow-green-sm'
    );
  }
  const rec = recommendFare({
    vehicle: type,
    km: parseFloat(ST.routeDistance) || 0,
    minutes: Number(ST.routeTime) || 0
  });
  applyRecommendedFare(rec);
}

export function adjFare(d) {
  ST.fare = Math.max(
    5000,
    (parseInt(document.getElementById('fare-input').value, 10) || ST.fare) + d
  );
  document.getElementById('fare-input').value = ST.fare;
  const badge = document.getElementById('route-fare-badge');
  if (badge)
    badge.innerHTML = `<i class="fa-solid fa-coins"></i> ${ST.fare.toLocaleString()} ₭`;
}

function renderBids(order) {
  const con = document.getElementById('bids-container');
  if (!con || !order) return;
  document.getElementById('bid-count').innerText = String(order.bids.length);
  document.getElementById('offered-price-txt').innerText =
    `${order.offerFare.toLocaleString()} ₭`;

  con.innerHTML = order.bids
    .map((b) => {
      const tag =
        b.type === 'accept'
          ? '<span class="text-[9px] bg-idrive-green/20 text-idrive-green px-1.5 py-0.5 rounded-full font-bold">ຮັບລາຄາ</span>'
          : b.type === 'counter'
            ? '<span class="text-[9px] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">ຕໍ່ລາຄາ</span>'
            : '<span class="text-[9px] bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded-full font-bold">ຕອບກັບ</span>';
      return `<div class="bg-idrive-dark p-3.5 rounded-2xl border border-idrive-border space-y-2 hover:border-idrive-green transition shadow fade-up" data-bid="${b.driverId}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${b.img}" class="w-12 h-12 rounded-2xl object-cover border-2 border-idrive-green shrink-0 shadow">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap"><h4 class="font-extrabold text-xs truncate">${b.name}</h4><span class="text-[10px] text-yellow-400 font-bold">★${b.rating}</span>${tag}</div>
              <p class="text-[11px] text-gray-400 truncate">${b.car}</p>
              <span class="text-[10px] text-idrive-green font-bold">⏱ ${b.eta}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-base font-black text-idrive-green block">${b.price.toLocaleString()} ₭</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 bg-idrive-green hover:bg-idrive-darkgreen text-gray-950 font-black text-xs py-2 rounded-xl glow-green-sm transition" onclick="acceptDriverBid('${order.id}','${b.driverId}')">ຕົກລົງ</button>
          <button class="bg-idrive-accent border border-idrive-border text-yellow-400 font-bold text-xs px-3 py-2 rounded-xl" onclick="counterToDriver('${order.id}','${b.driverId}',${b.price})">ຕໍ່ +5k</button>
        </div>
      </div>`;
    })
    .join('');
}

export async function findDriver() {
  if (!ST.pickup || !ST.dest) {
    toast('⚠️ ຕ້ອງປ້ອນຈຸດຮັບ & ຈຸດໝາຍ');
    return;
  }
  ST.fare =
    parseInt(document.getElementById('fare-input').value, 10) || ST.fare;

  let order;
  try {
    order = await createPassengerOrder({
      pickup: ST.pickup,
      dest: ST.dest,
      fare: ST.fare,
      vehicle: ST.vehicle,
      payment: ST.payment,
      note: document.getElementById('note-input')?.value || '',
      distance: ST.routeDistance,
      duration: ST.routeTime
    });
  } catch (err) {
    toast(`❌ ${err.message || 'ປະກາດງານບໍ່ສຳເລັດ'}`);
    return;
  }
  ST.activeOrderId = order.id;

  show('booking-form', false);
  show('searching-view', true);
  show('trip-view', false);
  window.sizeSheetForSearch?.();
  document.getElementById('bids-container').innerHTML = '';
  document.getElementById('bid-count').innerText = '0';
  document.getElementById('offered-price-txt').innerText =
    `${ST.fare.toLocaleString()} ₭`;
  toast(
    window.__idriveLive?.connected
      ? '📡 ປະກາດຫາຄົນຂັບຈິງແລ້ວ — ລໍຖ້າຂໍ້ສະເໜີ'
      : '📡 ປະກາດຫາຄົນຂັບແບບ InDrive...'
  );

  if (stopBots) stopBots();
  stopBots = spawnBotBids(order.id, () => {
    renderBids(getOrder(order.id));
  });

  if (!unsub) {
    unsub = onMarket(() => {
      const o = getActiveOrder();
      if (!o) return;
      if (o.status === 'open' || o.status === 'bidding') renderBids(o);
      if (
        o.status === 'matched' &&
        ST.role === 'passenger' &&
        document.getElementById('trip-view')?.classList.contains('hidden')
      ) {
        startMatchedTrip(o);
      }
      if (o.status === 'matched' && window.__idriveLive?.connected) {
        syncLiveTripPhase(o);
      }
    });
  }
}

export async function acceptDriverBid(orderId, driverId) {
  if (stopBots) {
    stopBots();
    stopBots = null;
  }
  const matched = await acceptBid(orderId, driverId);
  if (!matched) {
    toast('❌ ບໍ່ພົບຂໍ້ສະເໜີ');
    return;
  }
  startMatchedTrip(matched);
}

export async function counterToDriver(orderId, driverId, currentPrice) {
  const newPrice = Math.max(5000, currentPrice + 5000);
  const bid = getOrder(orderId)?.bids.find((b) => String(b.driverId) === String(driverId));
  if (!bid) return;
  await addBid(orderId, {
    ...bid,
    price: newPrice,
    type: 'passenger_counter',
    at: Date.now()
  });
  // Update passenger's posted offer too for clarity
  toast(`📤 ຕໍ່ລາຄາ ${newPrice.toLocaleString()} ₭ ໃຫ້ຄົນຂັບ`);
  renderBids(getOrder(orderId));

  if (window.__idriveLive?.connected) return;

  setTimeout(() => {
    const o = getOrder(orderId);
    if (!o || o.status === 'matched') return;
    if (Math.random() < 0.65) {
      addBid(orderId, {
        ...bid,
        price: newPrice,
        type: 'accept',
        at: Date.now()
      });
      toast(`✅ ${bid.name} ຮັບລາຄາ ${newPrice.toLocaleString()} ₭`);
      renderBids(getOrder(orderId));
    } else {
      const higher = newPrice + 5000;
      addBid(orderId, {
        ...bid,
        price: higher,
        type: 'counter',
        at: Date.now()
      });
      toast(`🔁 ${bid.name} ຕໍ່ອີກ ${higher.toLocaleString()} ₭`);
      renderBids(getOrder(orderId));
    }
  }, 1200);
}

function startMatchedTrip(order) {
  const bid = order.acceptedBid;
  lastTripPhase = null;
  show('searching-view', false);
  show('booking-form', false);
  show('trip-view', true);
  setCompleteTripReady(false);
  window.sizeSheetForTrip?.();

  document.getElementById('trip-driver-name').innerText = bid.name;
  document.getElementById('trip-driver-car').innerText = bid.car;
  document.getElementById('trip-driver-img').src = bid.img;
  document.getElementById('trip-driver-rating').innerText = bid.rating;
  document.getElementById('trip-price').innerText =
    `${(order.finalFare || bid.price).toLocaleString()} ₭`;
  document.getElementById('trip-payment').innerText = order.payment;
  if (order.distance) {
    document.getElementById('trip-distance').innerText = `${order.distance} ກມ`;
  }

  setChatPeer(bid.name);
  resetChat(`ສະບາຍດີ! ຂ້ອຍ ${bid.name.split(' ').slice(0, 2).join(' ')} ກຳລັງໄປຮັບ. 🚗`);
  toast(`✅ ຕົກລົງ: ${bid.name} • ${(order.finalFare || bid.price).toLocaleString()} ₭`);

  ST.pickup = order.pickup;
  ST.dest = order.dest;

  if (window.__idriveLive?.connected) {
    syncLiveTripPhase(order);
    return;
  }

  animateDriver(() => {
    setTripPhase(order.id, 'arrived');
    setCompleteTripReady(true);
    window.sizeSheetForTrip?.();
  });
}

function syncLiveTripPhase(order) {
  const s = document.getElementById('trip-status');
  const u = document.getElementById('trip-sub');
  const labels = {
    to_pickup: ['ຄົນຂັບກຳລັງມາຮັບ...', 'ຕຳແໜ່ງສົດຈາກ GPS ຄົນຂັບ'],
    waiting: ['ຄົນຂັບຮອດຈຸດຮັບແລ້ວ', 'ກະລຸນາຂຶ້ນລົດ'],
    onboard: ['ກຳລັງເດີນທາງໄປຈຸດໝາຍ...', 'ນັ່ງຄົນຂັບແລ້ວ'],
    arrived: ['ຮອດຈຸດໝາຍແລ້ວ ✅', 'ກະລຸນາຊຳລະ & ໃຫ້ຄະແນນ']
  };
  const pair = labels[order.phase] || labels.to_pickup;
  if (s) s.innerText = pair[0];
  if (u) u.innerText = pair[1];
  if (order.phase === 'arrived') {
    setCompleteTripReady(true);
    if (lastTripPhase !== 'arrived') window.sizeSheetForTrip?.();
  } else {
    setCompleteTripReady(false);
  }
  lastTripPhase = order.phase;
}

export async function cancelRequest() {
  if (stopBots) {
    stopBots();
    stopBots = null;
  }
  const id = ST.activeOrderId || getActiveOrder()?.id;
  if (id) await cancelOrder(id);
  ST.activeOrderId = null;
  lastTripPhase = null;
  show('searching-view', false);
  show('trip-view', false);
  show('booking-form', true);
  window.showRideStep?.();
  toast('ຍົກເລີກຄຳຮ້ອງ');
}

export function completeTrip() {
  const order = getActiveOrder();
  const live = window.__idriveLive?.connected;
  if (order?.status === 'matched' && order.phase !== 'arrived' && live) {
    toast('ກະລຸນາລໍຖ້າຮອດຈຸດໝາຍກ່ອນ');
    return;
  }
  stopDriverAnim();
  openModal('rating-modal');
}

export function setRating(s) {
  ST.pendingRating = s;
  document.querySelectorAll('#rating-stars i').forEach((el, i) => {
    el.classList.toggle('text-yellow-400', i < s);
    el.classList.toggle('text-gray-600', i >= s);
  });
  toast(`★ ${s} ດາວ`);
}

export function submitReview() {
  const order = getActiveOrder();
  const review = document.getElementById('review-input')?.value || '';
  if (order) {
    completeOrder(order.id, {
      rating: ST.pendingRating || 5,
      review
    });
  }
  closeModal('rating-modal');
  show('trip-view', false);
  show('searching-view', false);
  show('booking-form', true);
  ST.activeOrderId = null;
  lastTripPhase = null;
  window.showLocationStep?.();
  refreshWalletUI();
  renderHistory();
  toast('ຂອບໃຈ! ທ່ຽວສຳເລັດ ❤️');
}

/** Used when driver accepts from driver panel — mirror passenger UI */
export function syncPassengerToMatched(order) {
  if (ST.role !== 'passenger') return;
  if (stopBots) {
    stopBots();
    stopBots = null;
  }
  startMatchedTrip(order);
}

export function bootPassengerListeners() {
  onMarket((db) => {
    refreshWalletUI(db);
    const o = getActiveOrder();
    if (
      o?.status === 'matched' &&
      ST.role === 'passenger' &&
      document.getElementById('trip-view')?.classList.contains('hidden')
    ) {
      startMatchedTrip(o);
    } else if (o?.status === 'matched' && window.__idriveLive?.connected) {
      syncLiveTripPhase(o);
    }
  });
}
