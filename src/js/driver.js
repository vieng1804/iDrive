/** Driver workspace — live InDrive job feed + accept/counter */
import { ST } from './state.js';
import { show, toast } from './ui.js';
import { loadDB } from './persist.js';
import {
  getOpenOrders,
  getActiveOrder,
  driverAcceptOffer,
  driverCounterOffer,
  ME_AS_DRIVER,
  onMarket
} from './marketplace.js';
import { syncPassengerToMatched } from './passenger.js';
import { isDriverApproved } from './driverApply.js';

let draftCounters = {};

export function switchRole() {
  const toDriver = ST.role === 'passenger';

  // Require driver application before entering driver mode
  if (toDriver && !isDriverApproved()) {
    toast('📋 ກະລຸນາສະໝັກຂັບລົດກ່ອນ');
    window.openDriverApply?.();
    return;
  }

  ST.role = toDriver ? 'driver' : 'passenger';
  const badge = document.getElementById('role-badge');
  const roleBtn = document.getElementById('role-toggle-btn');
  const roleIcon = document.getElementById('role-toggle-icon');
  const roleText = document.getElementById('switch-role-text');

  if (ST.role === 'driver') {
    if (badge) {
      badge.innerText = 'ຄົນຂັບ';
      badge.className = 'app-brand-role is-driver';
    }
    if (roleBtn) {
      roleBtn.classList.add('is-driver');
      roleBtn.setAttribute('aria-label', 'ສະຫຼັບໄປໂໝດຜູ້ໂດຍສານ');
      roleBtn.title = 'ໂໝດຜູ້ໂດຍສານ';
    }
    if (roleIcon) roleIcon.className = 'fa-solid fa-user';
    if (roleText) roleText.innerText = 'ໂໝດຜູ້ໂດຍສານ';
    show('passenger-sheet', false);
    show('driver-panel', true);
    show('driver-active', false);
    refreshDriverStats();
    renderDriverFeed();
    toast('🚗 ໂໝດຄົນຂັບ — ຮັບງານ / ຕໍ່ລາຄາໄດ້');
  } else {
    if (badge) {
      badge.innerText = 'ຜູ້ໂດຍສານ';
      badge.className = 'app-brand-role';
    }
    if (roleBtn) {
      roleBtn.classList.remove('is-driver');
      roleBtn.setAttribute('aria-label', 'ສະຫຼັບໄປໂໝດຄົນຂັບ');
      roleBtn.title = 'ໂໝດຄົນຂັບ';
    }
    if (roleIcon) roleIcon.className = 'fa-solid fa-car-side';
    if (roleText) roleText.innerText = 'ໂໝດຄົນຂັບ';
    show('driver-panel', false);
    show('driver-active', false);
    show('passenger-sheet', true);
    toast('🧑 ໂໝດຜູ້ໂດຍສານ');
  }
}

export function toggleDriverOnline() {
  const on = document.getElementById('driver-online').checked;
  ST.driverOnline = on;
  const txt = document.getElementById('driver-status-txt');
  txt.innerText = on ? '🟢 ພ້ອມຮັບງານ' : '🔴 ອອຟໄລນ໌';
  txt.className = `text-xs font-bold ${on ? 'text-idrive-green' : 'text-red-400'}`;
  toast(on ? '✅ ເປີດຮັບງານ' : '⏸ ປິດຮັບງານ');
  if (on) renderDriverFeed();
  else {
    const feed = document.getElementById('driver-feed');
    if (feed)
      feed.innerHTML =
        '<p class="text-center text-xs text-gray-500 py-6">ອອຟໄລນ໌ — ເປີດສະວິດເພື່ອຮັບງານ</p>';
  }
}

export function refreshDriverStats(db = loadDB()) {
  const earn = document.getElementById('driver-earn');
  const trips = document.getElementById('driver-trips');
  const rating = document.getElementById('driver-rating-stat');
  if (earn) earn.innerText = `${db.earnings.toLocaleString()} ₭`;
  if (trips) trips.innerText = String(db.tripsDone);
  if (rating) rating.innerText = `${db.driverRating} ★`;
}

function short(n = '', max = 28) {
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

export function renderDriverFeed() {
  const feed = document.getElementById('driver-feed');
  if (!feed) return;

  if (ST.driverOnline === false) {
    feed.innerHTML =
      '<p class="text-center text-xs text-gray-500 py-6">ອອຟໄລນ໌</p>';
    return;
  }

  const orders = getOpenOrders();
  document.getElementById('driver-job-count').innerText = String(orders.length);
  refreshDriverStats();

  if (!orders.length) {
    feed.innerHTML =
      '<p class="text-center text-xs text-gray-500 py-6">ຍັງບໍ່ມີງານ — ໃຫ້ຜູ້ໂດຍສານປະກາດກ່ອນ<br><span class="text-idrive-green">ຫຼືສະຫຼັບໄປໂໝດຜູ້ໂດຍສານແລ້ວກັບມາ</span></p>';
    return;
  }

  feed.innerHTML = orders
    .map((o) => {
      const counter =
        draftCounters[o.id] ||
        Math.ceil((o.offerFare * 1.15) / 1000) * 1000;
      draftCounters[o.id] = counter;
      const veh =
        { ride: 'ເກັງ', moto: 'ມໍໄຊ', comfort: 'ຄອມຟອດ', suv: 'SUV' }[
          o.vehicle
        ] || o.vehicle;
      return `<div class="bg-idrive-dark p-3.5 rounded-2xl border border-idrive-border space-y-2.5 shadow hover:border-idrive-green transition fade-up">
        <div class="flex justify-between items-start gap-2">
          <div>
            <span class="text-xs font-bold"><i class="fa-solid fa-user text-gray-400 mr-1"></i>${o.passengerName}</span>
            <p class="text-[10px] text-gray-400 mt-0.5">${veh} • ${o.distance || '—'} ກມ • ${o.payment}</p>
          </div>
          <span class="text-base font-black text-idrive-green">${o.offerFare.toLocaleString()} ₭</span>
        </div>
        <div class="text-xs text-gray-300 space-y-0.5">
          <p class="flex items-center gap-1.5"><i class="fa-solid fa-circle text-[7px] text-idrive-green"></i>${short(o.pickup?.name)}</p>
          <p class="flex items-center gap-1.5"><i class="fa-solid fa-square text-[7px] text-red-500"></i>${short(o.dest?.name)}</p>
        </div>
        ${o.note ? `<p class="text-[10px] text-yellow-400/90">📝 ${o.note}</p>` : ''}
        <div class="flex items-center gap-2 bg-idrive-card rounded-xl p-2 border border-idrive-border">
          <button class="w-9 h-9 rounded-lg bg-idrive-accent font-black" onclick="adjDriverCounter('${o.id}',-5000)">−</button>
          <div class="flex-1 text-center">
            <div class="text-[9px] text-gray-400">ຕໍ່ລາຄາ</div>
            <div id="ctr-${o.id}" class="font-black text-yellow-400 text-sm">${counter.toLocaleString()} ₭</div>
          </div>
          <button class="w-9 h-9 rounded-lg bg-idrive-accent font-black" onclick="adjDriverCounter('${o.id}',5000)">+</button>
        </div>
        <div class="flex gap-2">
          <button onclick="driverTakeJob('${o.id}')" class="flex-1 bg-idrive-green text-gray-950 font-black py-2.5 rounded-xl text-xs hover:bg-idrive-darkgreen transition glow-green-sm">ຮັບ ${o.offerFare.toLocaleString()} ₭</button>
          <button onclick="driverSendCounter('${o.id}')" class="bg-idrive-accent text-yellow-400 border border-yellow-500/30 font-bold px-3 py-2.5 rounded-xl text-xs hover:bg-idrive-hover transition">ສົ່ງຕໍ່ລາຄາ</button>
        </div>
      </div>`;
    })
    .join('');
}

export function adjDriverCounter(orderId, delta) {
  const cur = draftCounters[orderId] || 30000;
  draftCounters[orderId] = Math.max(5000, cur + delta);
  const el = document.getElementById(`ctr-${orderId}`);
  if (el) el.innerText = `${draftCounters[orderId].toLocaleString()} ₭`;
}

export function driverTakeJob(orderId) {
  const matched = driverAcceptOffer(orderId, ME_AS_DRIVER);
  if (!matched) {
    toast('❌ ຮັບງານບໍ່ສຳເລັດ');
    return;
  }
  toast(`✅ ຮັບງານ ${(matched.finalFare || matched.offerFare).toLocaleString()} ₭`);
  showDriverActive(matched);
  // If user switches back to passenger, trip continues there
  syncPassengerToMatched(matched);
}

export function driverSendCounter(orderId) {
  const price = draftCounters[orderId] || 35000;
  driverCounterOffer(orderId, ME_AS_DRIVER, price);
  toast(`📤 ສົ່ງຕໍ່ລາຄາ ${price.toLocaleString()} ₭ — ລໍຖ້າຜູ້ໂດຍສານ`);
  renderDriverFeed();
}

function showDriverActive(order) {
  show('driver-panel', true);
  const box = document.getElementById('driver-active');
  if (!box) return;
  show('driver-active', true);
  box.innerHTML = `
    <div class="bg-idrive-green/10 border border-idrive-green/40 p-3 rounded-2xl space-y-2">
      <div class="flex justify-between items-center">
        <span class="text-xs font-black text-idrive-green">ງານທີ່ຮັບແລ້ວ</span>
        <span class="font-black text-idrive-green">${(order.finalFare || order.offerFare).toLocaleString()} ₭</span>
      </div>
      <p class="text-xs text-gray-300">${short(order.pickup?.name)} ➔ ${short(order.dest?.name)}</p>
      <p class="text-[10px] text-gray-400">ສະຫຼັບໄປໂໝດຜູ້ໂດຍສານເພື່ອເບິ່ງການເດີນທາງສົດ</p>
    </div>`;
}

export function bootDriverListeners() {
  onMarket(() => {
    if (ST.role === 'driver') renderDriverFeed();
    refreshDriverStats();
  });
}
