/** Driver workspace — live InDrive job feed + accept/counter */
import { ST } from './state.js';
import { show, toast } from './ui.js';
import { loadDB } from './persist.js';
import {
  getOpenOrders,
  getActiveOrder,
  driverAcceptOffer,
  driverCounterOffer,
  getMeAsDriver,
  setTripPhase,
  onMarket
} from './marketplace.js';
import { syncPassengerToMatched } from './passenger.js';
import { isDriverApproved } from './driverApply.js';
import { goOfflineGps, goOnlineWithGps } from './live/gps.js';
import { isLive } from './live/session.js';
import { dbView } from './live/client.js';

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
  document.getElementById('app-shell')?.classList.toggle('role-driver', ST.role === 'driver');
  document.getElementById('app-shell')?.classList.toggle('role-passenger', ST.role === 'passenger');
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
    document.querySelector('#screen-home main')?.classList.remove('map-expanded');
    document.getElementById('map-search-panel')?.classList.add('hidden');
    refreshDriverStats();
    renderDriverFeed();
    syncDriverDock();
    toast('🚗 ໂໝດຄົນຂັບ — ເປີດຮັບງານເພື່ອເຫັນຄຳຂໍ');
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
    window.setSheetSnap?.('mid');
    toast('🧑 ໂໝດຜູ້ໂດຍສານ');
  }
}

export async function toggleDriverOnline() {
  const on = document.getElementById('driver-online').checked;
  ST.driverOnline = on;
  if (isLive()) {
    try {
      if (on) await goOnlineWithGps();
      else await goOfflineGps();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
      document.getElementById('driver-online').checked = !on;
      ST.driverOnline = !on;
      syncDriverDock();
      return;
    }
  }
  syncDriverDock();
  toast(on ? '✅ ເປີດຮັບງານແລ້ວ' : '⏸ ປິດຮັບງານແລ້ວ');
  renderDriverFeed();
}

export function syncDriverDock() {
  const on = ST.driverOnline !== false;
  const dock = document.getElementById('drv-dock');
  const status = document.getElementById('driver-status-txt');
  const sub = document.getElementById('drv-dock-sub');
  const label = document.getElementById('drv-go-label');
  dock?.classList.toggle('is-online', on);
  dock?.classList.toggle('is-offline', !on);
  if (status) {
    status.innerHTML = on
      ? '<span class="drv-radar"></span>ອອນລາຍ — ລໍຖ້າງານ'
      : 'ອອຟໄລນ໌';
  }
  if (sub) {
    sub.textContent = on
      ? 'ກຳລັງຊອກຫາຜູ້ໂດຍສານໃກ້ທ່ານ'
      : 'ເປີດຮັບງານເພື່ອເຫັນຄຳຂໍຈາກຜູ້ໂດຍສານ';
  }
  if (label) label.textContent = on ? 'ປິດຮັບງານ' : 'ເປີດຮັບງານ';
}

export function refreshDriverStats(db) {
  const source = isLive() ? dbView() : db || loadDB();
  const earn = document.getElementById('driver-earn');
  const trips = document.getElementById('driver-trips');
  const rating = document.getElementById('driver-rating-stat');
  if (earn) earn.innerText = `${(source.earnings || 0).toLocaleString()} ₭`;
  if (trips) trips.innerText = String(source.tripsDone || 0);
  if (rating) rating.innerText = `${source.driverRating || 4.95} ★`;
}

function short(n = '', max = 28) {
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

export function renderDriverFeed() {
  const feed = document.getElementById('driver-feed');
  if (!feed) return;
  const countEl = document.getElementById('driver-job-count');
  refreshDriverStats();
  syncDriverDock();

  const active = getActiveOrder();
  if (active?.status === 'matched') {
    showDriverActive(active);
    feed.innerHTML = '';
    document.getElementById('drv-dock')?.classList.add('hidden');
    return;
  }
  show('driver-active', false);
  document.getElementById('drv-dock')?.classList.remove('hidden');

  if (ST.driverOnline === false) {
    feed.innerHTML = '';
    if (countEl) countEl.innerText = '0';
    return;
  }

  const orders = getOpenOrders();
  if (countEl) countEl.innerText = String(orders.length);

  if (!orders.length) {
    feed.innerHTML = '';
    return;
  }

  feed.innerHTML = orders
    .slice(0, 3)
    .map((o) => {
      const counter =
        draftCounters[o.id] ||
        Math.ceil((o.offerFare * 1.15) / 1000) * 1000;
      draftCounters[o.id] = counter;
      const veh =
        { ride: 'ເກັງ', moto: 'ມໍໄຊ', comfort: 'ຄອມຟອດ', suv: 'SUV' }[
          o.vehicle
        ] || o.vehicle;
      return `<article class="drv-req">
        <div class="drv-req-top">
          <div class="drv-req-fare">${Number(o.offerFare || 0).toLocaleString()} ₭</div>
          <div class="drv-req-meta">${veh}<br>${o.distance || '—'} ກມ · ${esc(o.payment || 'ເງິນສົດ')}</div>
        </div>
        <div class="drv-route">
          <p><i class="fa-solid fa-circle text-idrive-green"></i>${esc(short(o.pickup?.name, 32))}</p>
          <p><i class="fa-solid fa-square text-red-500"></i>${esc(short(o.dest?.name, 32))}</p>
        </div>
        ${o.note ? `<p class="drv-note">${esc(o.note)}</p>` : ''}
        <div class="drv-bid">
          <button type="button" onclick="adjDriverCounter('${o.id}',-5000)">−</button>
          <div><small>ສະເໜີລາຄາ</small><b id="ctr-${o.id}">${counter.toLocaleString()} ₭</b></div>
          <button type="button" onclick="adjDriverCounter('${o.id}',5000)">+</button>
        </div>
        <div class="drv-req-actions">
          <button type="button" class="btn-take" onclick="driverTakeJob('${o.id}')">ຮັບ ${Number(o.offerFare || 0).toLocaleString()} ₭</button>
          <button type="button" class="btn-bid" onclick="driverSendCounter('${o.id}')">ສົ່ງສະເໜີ</button>
        </div>
      </article>`;
    })
    .join('');
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function adjDriverCounter(orderId, delta) {
  const cur = draftCounters[orderId] || 85000;
  draftCounters[orderId] = Math.max(5000, cur + delta);
  const el = document.getElementById(`ctr-${orderId}`);
  if (el) el.innerText = `${draftCounters[orderId].toLocaleString()} ₭`;
}

export async function driverTakeJob(orderId) {
  try {
    const matched = await driverAcceptOffer(orderId, getMeAsDriver());
    if (!matched) {
      toast('❌ ຮັບງານບໍ່ສຳເລັດ');
      return;
    }
    toast(`✅ ຮັບງານ ${(matched.finalFare || matched.offerFare).toLocaleString()} ₭`);
    showDriverActive(matched);
    syncPassengerToMatched(matched);
  } catch (err) {
    toast(`❌ ${err.message}`);
  }
}

export async function driverSendCounter(orderId) {
  const price = draftCounters[orderId] || 85000;
  try {
    await driverCounterOffer(orderId, getMeAsDriver(), price);
    toast(`📤 ສົ່ງຕໍ່ລາຄາ ${price.toLocaleString()} ₭ — ລໍຖ້າຜູ້ໂດຍສານ`);
    renderDriverFeed();
  } catch (err) {
    toast(`❌ ${err.message}`);
  }
}

function showDriverActive(order) {
  show('driver-panel', true);
  const box = document.getElementById('driver-active');
  if (!box) return;
  show('driver-active', true);
  document.getElementById('drv-dock')?.classList.add('hidden');
  const phase = order.phase || 'to_pickup';
  const on = (p) => (phase === p ? 'is-on' : '');
  box.innerHTML = `
    <div class="drv-trip-h">
      <div>
        <small style="color:#9ca3af;font-size:11px;font-weight:800">ງານທີ່ກຳລັງເດີນທາງ</small>
        <p style="margin:2px 0 0;font-weight:800">${esc(order.passengerName || 'ຜູ້ໂດຍສານ')}</p>
      </div>
      <b>${Number(order.finalFare || order.offerFare || 0).toLocaleString()} ₭</b>
    </div>
    <div class="drv-route">
      <p><i class="fa-solid fa-circle text-idrive-green"></i>${esc(short(order.pickup?.name, 34))}</p>
      <p><i class="fa-solid fa-square text-red-500"></i>${esc(short(order.dest?.name, 34))}</p>
    </div>
    <div class="drv-phases">
      <button class="${on('waiting')}" onclick="driverAdvancePhase('waiting')">ຮອດຈຸດຮັບ</button>
      <button class="${on('onboard')}" onclick="driverAdvancePhase('onboard')">ຜູ້ໂດຍສານຂຶ້ນ</button>
      <button class="${on('arrived')}" onclick="driverAdvancePhase('arrived')">ສົ່ງຮອດ</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button type="button" onclick="openModal('chat-modal')" class="btn-bid" style="flex:1;height:42px">ແຊັດ</button>
      <button type="button" onclick="startCall()" class="btn-take" style="flex:1;height:42px">ໂທ</button>
    </div>`;
}

export async function driverAdvancePhase(phase) {
  const order = getActiveOrder();
  if (!order) return;
  try {
    await setTripPhase(order.id, phase);
    toast(
      phase === 'waiting'
        ? '📍 ຮອດຈຸດຮັບແລ້ວ'
        : phase === 'onboard'
          ? '🚗 ເລີ່ມເດີນທາງ'
          : '✅ ຮອດປາຍທາງ'
    );
    showDriverActive({ ...order, phase });
  } catch (err) {
    toast(`⚠️ ${err.message}`);
  }
}

export function bootDriverListeners() {
  onMarket(() => {
    if (ST.role === 'driver') {
      renderDriverFeed();
      const active = getActiveOrder();
      if (active?.status === 'matched' && active.driverId) showDriverActive(active);
    }
    refreshDriverStats();
  });
}
