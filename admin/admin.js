import {
  connectLive,
  liveLogin,
  liveLogout,
  onLive,
  getLiveState
} from '../src/js/live/client.js';
import { fetchAdminOverview, adminSetDriver, adminCancelOrder, kycDocUrl } from '../src/js/live/market.js';
import { KYC_GROUPS, isSlotRequired, kycProgress } from '../src/js/kyc.js';

const TITLES = {
  overview: ['ພາບລວມ', 'ຕິດຕາມການເດີນທາງ ແລະອະນຸມັດຄົນຂັບແບບສົດ'],
  live: ['ແຜນທີ່ສົດ', 'ຕຳແໜ່ງຄົນຂັບ ແລະທ່ຽວທີ່ກຳລັງເດີນທາງ'],
  trips: ['ທ່ຽວທັງໝົດ', 'ຄົ້ນຫາ ຍົກເລີກ ຫຼືຕິດຕາມສະຖານະງານ'],
  drivers: ['ຄົນຂັບ / KYC', 'ອະນຸມັດຄຳຂໍ ແລະເບິ່ງສະຖານະອອນລາຍ'],
  users: ['ຜູ້ໃຊ້', 'ບັນຊີຜູ້ໂດຍສານ ແລະແອັດມິນ'],
  activity: ['ກິດຈະກຳ', 'ບັນທຶກການເຮັດວຽກຂອງລະບົບ']
};

const ui = {
  view: 'overview',
  tripFilter: 'live',
  tripQ: '',
  drvQ: '',
  kycId: null,
  data: { stats: {}, orders: [], drivers: [], users: [], events: [] }
};

let map;
let ovMap;
let markers = [];
let ovMarkers = [];
let toastTimer;

boot();

async function boot() {
  bind();
  tickClock();
  setInterval(tickClock, 1000);
  await connectLive();
  const user = getLiveState().user;
  if (user?.role === 'admin') {
    showApp(user);
    await refresh();
  } else {
    showLogin();
  }
  onLive(() => {
    updateConn();
    if (getLiveState().user?.role === 'admin') refresh();
  });
}

function bind() {
  document.getElementById('login-btn').addEventListener('click', onLogin);
  document.getElementById('login-pin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLogin();
  });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await liveLogout();
    showLogin();
  });
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  document.getElementById('trip-q').addEventListener('input', (e) => {
    ui.tripQ = e.target.value.trim().toLowerCase();
    renderTrips();
  });
  document.getElementById('drv-q').addEventListener('input', (e) => {
    ui.drvQ = e.target.value.trim().toLowerCase();
    renderDrivers();
  });
  document.querySelectorAll('#trip-filters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.tripFilter = btn.dataset.filter;
      document.querySelectorAll('#trip-filters button').forEach((b) => b.classList.toggle('is-on', b === btn));
      renderTrips();
    });
  });
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
  document.getElementById('kyc-approve').addEventListener('click', () => decideKyc(false));
  document.getElementById('kyc-reject').addEventListener('click', () => decideKyc(true));
  document.getElementById('kyc-lightbox').addEventListener('click', closeLightbox);
}

async function onLogin() {
  const phone = document.getElementById('login-phone').value.replace(/\D/g, '');
  const pin = document.getElementById('login-pin').value.trim();
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  err.hidden = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'ກຳລັງເຂົ້າ...';
  }
  try {
    const user = await liveLogin({ phone, name: 'iDrive Admin', pin });
    if (user.role !== 'admin') {
      await liveLogout();
      throw new Error('ບັນຊີນີ້ບໍ່ແມ່ນແອັດມິນ');
    }
    showApp(user);
    await refresh();
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || 'ເຂົ້າລະບົບບໍ່ສຳເລັດ';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'ເຂົ້າສູ່ລະບົບ';
    }
  }
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp(user) {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  document.getElementById('who').textContent = user?.name || 'Admin';
  updateConn();
  setView(ui.view);
}

function updateConn() {
  const pill = document.getElementById('conn-pill');
  const live = getLiveState();
  pill.classList.remove('is-live', 'is-demo');
  if (live.connected) {
    pill.textContent = 'LIVE';
    pill.classList.add('is-live');
  } else if (live.reachable) {
    pill.textContent = 'ກຳລັງເຊື່ອມ';
  } else {
    pill.textContent = 'DEMO';
    pill.classList.add('is-demo');
  }
}

function setView(name) {
  ui.view = name;
  document.querySelectorAll('.ops-nav nav button').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('hidden', el.id !== `view-${name}`);
  });
  const [title, sub] = TITLES[name];
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-sub').textContent = sub;
  render();
  if (name === 'live') setTimeout(() => map?.invalidateSize(), 80);
  if (name === 'overview') setTimeout(() => ovMap?.invalidateSize(), 80);
}

async function refresh(manual = false) {
  const btn = document.getElementById('refresh-btn');
  if (manual && btn) btn.classList.add('spin');
  try {
    ui.data = await fetchAdminOverview();
    render();
  } catch (err) {
    toast(err.message);
  } finally {
    if (btn) btn.classList.remove('spin');
  }
}

function render() {
  renderOverview();
  renderTrips();
  renderDrivers();
  renderUsers();
  renderActivity();
  if (ui.view === 'live') renderMap();
  if (ui.view === 'overview') renderOverviewMap();
}

function renderOverview() {
  const s = withStats(ui.data);
  const mix = s.vehicleMix || {};
  const pay = s.paymentMix || {};
  const hours = s.hours || [];
  const orders = ui.data.orders || [];
  const drivers = ui.data.drivers || [];

  setText('kpi-revenue', money(s.revenue));
  setText('kpi-week', `${s.weekTrips || 0} ທ່ຽວ`);
  setText('ov-updated', s && ui.data.updatedAt ? timeAgo(ui.data.updatedAt) : '—');

  setText('kpi-today-rev', money(s.todayRevenue));
  const revSub = document.getElementById('kpi-today-rev-sub');
  if (revSub) {
    const { text, cls } = deltaLabel(s.todayRevenue, s.yesterdayRevenue);
    revSub.textContent = text;
    revSub.className = cls;
  }

  setText('kpi-live', s.liveTrips);
  setText('kpi-open', s.openJobs);
  setText('kpi-open-sub', s.bidding ? `ປະມູນ ${s.bidding} ງານ` : 'ລໍຖ້າຄົນຂັບ');
  setText('kpi-online', s.onlineDrivers);
  setText('kpi-online-sub', `ຈາກທັງໝົດ ${s.drivers || 0} ຄົນ`);
  setText('kpi-pending', s.pendingDrivers);
  setText('kpi-today', s.todayTrips);
  setText('kpi-today-sub', `ອັດຕາສຳເລັດ ${s.completionRate || 0}% · ຍົກເລີກ ${s.cancelled || 0}`);
  setText('kpi-avg', money(s.avgFare));
  setText('kpi-avg-sub', s.avgKm ? `ໄລຍະສະເລ່ຍ ${s.avgKm} ກມ` : 'ຍັງບໍ່ມີຂໍ້ມູນໄລຍະ');
  setText('kpi-rating', s.ratingCount ? `★ ${s.avgRating}` : '—');
  setText('kpi-users', `${s.users || 0} ຜູ້ໃຊ້ · ${s.completed || 0} ທ່ຽວສຳເລັດ`);

  const live = orders.filter((o) => ['open', 'bidding', 'matched'].includes(o.status));
  setText('ov-live-count', live.length);
  document.getElementById('ov-live').innerHTML = live.length
    ? live.slice(0, 8).map(jobCard).join('')
    : emptyState('fa-route', 'ຍັງບໍ່ມີງານສົດ');

  const pending = drivers.filter((d) => d.status === 'pending');
  document.getElementById('ov-kyc').innerHTML = pending.length
    ? pending.map(kycCard).join('')
    : emptyState('fa-id-card', 'ບໍ່ມີຄຳຂໍລໍຖ້າ');

  const fleet = [...drivers]
    .filter((d) => d.status === 'approved')
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 8);
  document.getElementById('ov-fleet').innerHTML = fleet.length
    ? fleet.map(fleetCard).join('')
    : emptyState('fa-car-side', 'ຍັງບໍ່ມີຄົນຂັບທີ່ອະນຸມັດ');

  document.getElementById('ov-hours').innerHTML = hours.length
    ? hours
        .map((h) => {
          const max = Math.max(1, ...hours.map((x) => x.n));
          const pct = Math.max(8, Math.round((h.n / max) * 100));
          return `<div class="bar" title="${h.n} ທ່ຽວ"><i style="height:${pct}%"></i><span>${String(h.h).padStart(2, '0')}</span></div>`;
        })
        .join('')
    : emptyState('fa-chart-column', 'ຍັງບໍ່ມີທ່ຽວ');

  const vehTotal = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  const payTotal = Object.values(pay).reduce((a, b) => a + b, 0) || 1;
  const vehRows = [
    ['ride', 'ເກັງ'],
    ['moto', 'ມໍໄຊ'],
    ['comfort', 'ຄອມຟອດ'],
    ['suv', 'SUV']
  ]
    .map(([k, label]) => mixRow(label, mix[k] || 0, vehTotal))
    .join('');
  const payRows = Object.entries(pay)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => mixRow(k, n, payTotal, 'pay'))
    .join('');
  document.getElementById('ov-mix').innerHTML =
    vehRows + (payRows ? `<div class="mix-row" style="margin-top:6px"><span></span><span></span><span></span></div>${payRows}` : '');

  const alerts = buildAlerts(s, pending);
  setText('ov-alert-count', alerts.length);
  document.getElementById('ov-alerts').innerHTML = alerts.map(alertCard).join('');

  const events = ui.data.events || [];
  document.getElementById('ov-events').innerHTML = events.length
    ? events.slice(0, 8).map(eventCard).join('')
    : emptyState('fa-clock-rotate-left', 'ຍັງບໍ່ມີກິດຈະກຳ');
}

function jobCard(o) {
  return `<article class="trip-card">
    <div class="trip-ico"><i class="fa-solid ${vehIcon(o.vehicle)}"></i></div>
    <div>
      <p>${esc(shortName(o.pickup?.name))} → ${esc(shortName(o.dest?.name))}</p>
      <small>${esc(o.passengerName)} · ${statusLo(o)}${o.distance ? ` · ${o.distance} ກມ` : ''}</small>
    </div>
    <span class="fare">${money(o.finalFare || o.offerFare)}</span>
  </article>`;
}

function kycCard(d) {
  const st = d.docStatus || kycProgress(d.docs || {}, d.idType);
  return `<article class="row">
    <div>
      <p>${esc(d.name)}</p>
      <small>${esc(d.car)} · ເອກະສານ ${st.have}/${st.need}</small>
    </div>
    <div class="actions">
      <button class="btn btn-ghost" data-kyc="${d.id}">ເບິ່ງ</button>
      <button class="btn btn-ok" data-approve="${d.id}">ອະນຸມັດ</button>
      <button class="btn btn-no" data-reject="${d.id}">ປະຕິເສດ</button>
    </div>
  </article>`;
}

function fleetCard(d) {
  return `<article class="row">
    <div style="display:flex;gap:10px;align-items:center;min-width:0">
      <img class="fleet-ava ${d.online ? 'on' : ''}" src="${esc(d.img || '')}" alt="">
      <div>
        <p>${esc(d.name)}</p>
        <small>${esc(d.car)} · ★ ${d.rating || '—'}</small>
      </div>
    </div>
    <span class="fare">${d.online ? 'ອອນລາຍ' : 'ອອຟ'}</span>
  </article>`;
}

function mixRow(label, n, total, kind = '') {
  const pct = Math.round((n / total) * 100);
  return `<div class="mix-row"><span>${esc(label)}</span><div class="track ${kind}"><em style="width:${pct}%"></em></div><b>${n}</b></div>`;
}

function buildAlerts(s, pending) {
  const items = [];
  if (pending.length) items.push({ kind: 'warn', icon: 'fa-id-card', text: `${pending.length} ຄຳຂໍຄົນຂັບລໍຖ້າອະນຸມັດ` });
  if (s.waitingLong) items.push({ kind: 'warn', icon: 'fa-hourglass-half', text: `${s.waitingLong} ງານເປີດນานກວ່າ 5 ນາທີ` });
  if (s.openJobs && !s.onlineDrivers) items.push({ kind: 'warn', icon: 'fa-car', text: 'ມີງານເປີດແຕ່ບໍ່ມີຄົນຂັບອອນລາຍ' });
  if (s.liveTrips) items.push({ kind: 'info', icon: 'fa-route', text: `${s.liveTrips} ທ່ຽວກຳລັງເດີນທາງຕອນນີ້` });
  if (s.todayTrips) items.push({ kind: 'ok', icon: 'fa-circle-check', text: `ສຳເລັດ ${s.todayTrips} ທ່ຽວມື້ນີ້ · ${money(s.todayRevenue)}` });
  if (!items.length) items.push({ kind: 'ok', icon: 'fa-leaf', text: 'ລະບົບປົກກະຕິ — ບໍ່ມີແຈ້ງເຕືອນດ່ວນ' });
  return items;
}

function alertCard(a) {
  return `<div class="alert-item ${a.kind}"><i class="fa-solid ${a.icon}"></i><span>${esc(a.text)}</span></div>`;
}

function eventCard(e) {
  return `<article class="row"><div><p>${esc(eventLo(e.type))}</p><small>${esc(e.detail || e.orderId || e.userId || '')}</small></div><time>${fmtTime(e.at)}</time></article>`;
}

function renderTrips() {
  const q = ui.tripQ;
  const rows = (ui.data.orders || []).filter((o) => {
    if (ui.tripFilter === 'live') return ['open', 'bidding', 'matched'].includes(o.status);
    if (ui.tripFilter !== 'all') return o.status === ui.tripFilter;
    return true;
  }).filter((o) => {
    if (!q) return true;
    return `${o.passengerName} ${o.pickup?.name} ${o.dest?.name} ${o.acceptedBid?.name}`.toLowerCase().includes(q);
  });
  document.getElementById('trip-rows').innerHTML = rows.length
    ? rows.map((o) => `<tr>
        <td>${fmtTime(o.createdAt)}</td>
        <td>${badge(o)}</td>
        <td>${esc(o.passengerName)}</td>
        <td>${esc(o.pickup?.name || '—')} → ${esc(o.dest?.name || '—')}</td>
        <td>${esc(o.acceptedBid?.name || '—')}</td>
        <td>${money(o.finalFare || o.offerFare)}</td>
        <td>${
          ['open', 'bidding', 'matched'].includes(o.status)
            ? `<button class="btn btn-no" data-cancel="${o.id}">ຍົກເລີກ</button>`
            : ''
        }</td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">ບໍ່ພົບທ່ຽວ</td></tr>`;
}

function renderDrivers() {
  const q = ui.drvQ;
  const rows = (ui.data.drivers || []).filter((d) => {
    if (!q) return true;
    return `${d.name} ${d.phone} ${d.car} ${d.plate}`.toLowerCase().includes(q);
  });
  document.getElementById('drv-rows').innerHTML = rows.length
    ? rows.map((d) => {
        const st = d.docStatus || kycProgress(d.docs || {}, d.idType);
        const docsCls = st.complete ? 'b-done' : 'b-wait';
        return `<tr>
        <td><strong>${esc(d.name)}</strong><br><small>${esc(d.phone || '')}</small></td>
        <td>${esc(d.car)}</td>
        <td>${driverBadge(d.status)}</td>
        <td><span class="badge ${docsCls}">${st.have}/${st.need}</span></td>
        <td>${d.online ? '🟢 ອອນ' : '○ ອອຟ'}</td>
        <td>${d.trips || 0}</td>
        <td>${money(d.earnings)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" data-kyc="${d.id}">ເອກະສານ</button>
            ${
              d.status === 'pending'
                ? `<button class="btn btn-ok" data-approve="${d.id}">ອະນຸມັດ</button><button class="btn btn-no" data-reject="${d.id}">ປະຕິເສດ</button>`
                : d.status === 'approved'
                  ? `<button class="btn btn-no" data-reject="${d.id}">ລະງັບ</button>`
                  : `<button class="btn btn-ok" data-approve="${d.id}">ເປີດໃໝ່</button>`
            }
          </div>
        </td>
      </tr>`;
      }).join('')
    : `<tr><td colspan="8" class="empty">ບໍ່ພົບຄົນຂັບ</td></tr>`;
  if (ui.kycId) renderKycDrawer();
}

function renderUsers() {
  document.getElementById('user-rows').innerHTML = (ui.data.users || [])
    .map(
      (u) => `<tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.phone)}</td>
        <td>${u.role === 'admin' ? 'Admin' : 'ຜູ້ໃຊ້'}</td>
        <td>${u.trips || 0}</td>
        <td>${u.rating || '—'}</td>
        <td>${fmtTime(u.createdAt)}</td>
      </tr>`
    )
    .join('');
}

function renderActivity() {
  document.getElementById('act-list').innerHTML = (ui.data.events || []).length
    ? ui.data.events
        .map((e) => `<p><time>${fmtTime(e.at)}</time>${esc(e.type)}${e.userId ? ` · ${esc(e.userId)}` : ''}${e.orderId ? ` · ${esc(e.orderId)}` : ''}</p>`)
        .join('')
    : `<p class="empty">ຍັງບໍ່ມີກິດຈະກຳ</p>`;
}

function renderMap() {
  drawOpsMap('ops-map', true);
}

function renderOverviewMap() {
  drawOpsMap('ov-map', false);
}

function drawOpsMap(elId, withZoom) {
  const L = window.L;
  const el = document.getElementById(elId);
  if (!L || !el) return;
  const isLive = elId === 'ops-map';
  let inst = isLive ? map : ovMap;
  if (!inst) {
    inst = L.map(el, { zoomControl: withZoom, attributionControl: withZoom }).setView([17.9757, 102.6331], withZoom ? 13 : 12);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: withZoom ? '© Esri' : ''
    }).addTo(inst);
    if (isLive) map = inst;
    else ovMap = inst;
  }
  const bag = isLive ? markers : ovMarkers;
  bag.forEach((m) => inst.removeLayer(m));
  const next = [];
  (ui.data.drivers || []).forEach((d) => {
    if (d.lat == null || d.lng == null) return;
    const m = L.circleMarker([d.lat, d.lng], {
      radius: d.online ? 9 : 7,
      color: d.online ? '#00e86a' : '#64748b',
      fillColor: d.online ? '#00e86a' : '#64748b',
      fillOpacity: 0.9,
      weight: 2
    })
      .addTo(inst)
      .bindPopup(`<b>${esc(d.name)}</b><br>${esc(d.car)}<br>${d.online ? 'ອອນລາຍ' : 'ອອຟໄລນ໌'}`);
    next.push(m);
  });
  (ui.data.orders || [])
    .filter((o) => o.status === 'matched' && o.pickup?.lat != null)
    .forEach((o) => {
      const m = L.circleMarker([o.pickup.lat, o.pickup.lng], {
        radius: 7,
        color: '#f5c542',
        fillColor: '#f5c542',
        fillOpacity: 0.9
      })
        .addTo(inst)
        .bindPopup(`<b>${esc(o.passengerName)}</b><br>${esc(o.pickup.name)} → ${esc(o.dest?.name || '')}`);
      next.push(m);
    });
  if (isLive) markers = next;
  else ovMarkers = next;
  inst.invalidateSize();
}

document.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) {
    setView(go.dataset.goto);
    return;
  }
  if (e.target.closest('[data-close-kyc]')) {
    closeKyc();
    return;
  }
  const preview = e.target.closest('[data-preview]');
  if (preview) {
    openLightbox(preview.dataset.preview);
    return;
  }
  const kyc = e.target.closest('[data-kyc]');
  if (kyc) {
    openKyc(kyc.dataset.kyc);
    return;
  }
  const approve = e.target.closest('[data-approve]');
  const reject = e.target.closest('[data-reject]');
  const cancel = e.target.closest('[data-cancel]');
  try {
    if (approve) {
      await adminSetDriver(approve.dataset.approve, false);
      toast('ອະນຸມັດຄົນຂັບແລ້ວ');
      await refresh();
    }
    if (reject) {
      await adminSetDriver(reject.dataset.reject, true);
      toast('ປັບສະຖານະຄົນຂັບແລ້ວ');
      await refresh();
    }
    if (cancel) {
      await adminCancelOrder(cancel.dataset.cancel);
      toast('ຍົກເລີກທ່ຽວແລ້ວ');
      await refresh();
    }
  } catch (err) {
    toast(err.message);
  }
});

function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('lo-LA');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? 0);
}

function withStats(data) {
  const s = { ...(data.stats || {}) };
  const orders = data.orders || [];
  if (!s.vehicleMix) {
    s.vehicleMix = { ride: 0, moto: 0, comfort: 0, suv: 0 };
    for (const o of orders) {
      if (s.vehicleMix[o.vehicle] != null) s.vehicleMix[o.vehicle] += 1;
    }
  }
  if (!s.paymentMix) {
    s.paymentMix = {};
    for (const o of orders) {
      const k = o.payment || 'ເງິນສົດ';
      s.paymentMix[k] = (s.paymentMix[k] || 0) + 1;
    }
  }
  if (!s.hours) {
    const t = Date.now();
    s.hours = Array.from({ length: 12 }, (_, i) => {
      const start = t - (12 - i) * 3600000;
      return {
        h: new Date(start).getHours(),
        n: orders.filter((o) => o.createdAt >= start && o.createdAt < start + 3600000).length
      };
    });
  }
  return s;
}

function money(n) {
  return `${Number(n || 0).toLocaleString()} ₭`;
}

function deltaLabel(cur, prev) {
  const a = Number(cur || 0);
  const b = Number(prev || 0);
  if (!b && !a) return { text: 'ທຽບກັບມື້ວານ —', cls: '' };
  if (!b) return { text: 'ເລີ່ມມື້ນີ້', cls: 'up' };
  const p = Math.round(((a - b) / b) * 100);
  return {
    text: `${p >= 0 ? '+' : ''}${p}% ທຽບມື້ວານ`,
    cls: p >= 0 ? 'up' : 'down'
  };
}

function timeAgo(ts) {
  const d = Date.now() - Number(ts || 0);
  if (d < 15000) return 'ຕອນນີ້';
  if (d < 60000) return `${Math.floor(d / 1000)} ວິ`;
  if (d < 3600000) return `${Math.floor(d / 60000)} ນທ ກ່ອນ`;
  return new Date(ts).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
}

function shortName(s) {
  const t = String(s || '—');
  return t.length > 22 ? `${t.slice(0, 20)}…` : t;
}

function vehIcon(v) {
  return { moto: 'fa-motorcycle', comfort: 'fa-car-side', suv: 'fa-truck-pickup' }[v] || 'fa-car';
}

function emptyState(icon, text) {
  return `<p class="empty"><i class="fa-solid ${icon}"></i><br>${text}</p>`;
}

function eventLo(type) {
  return (
    {
      'order.create': 'ປະກາດຫາຄົນຂັບ',
      'order.update': 'ອັບເດດທ່ຽວ',
      'driver.apply': 'ສະໝັກຄົນຂັບ',
      'driver.approve': 'ອະນຸມັດຄົນຂັບ',
      'driver.reject': 'ປະຕິເສດຄົນຂັບ',
      'user.register': 'ລົງທະບຽນຜູ້ໃຊ້',
      'admin.seed': 'ສ້າງບັນຊີແອັດມິນ',
      demo: 'ໂໝດເດໂມ — ບໍ່ມີເຊີບເວີສົດ'
    }[type] || type
  );
}

function openKyc(id) {
  ui.kycId = id;
  document.getElementById('kyc-drawer').classList.remove('hidden');
  const note = document.getElementById('kyc-note');
  if (note) note.value = '';
  renderKycDrawer();
}

function closeKyc() {
  ui.kycId = null;
  document.getElementById('kyc-drawer').classList.add('hidden');
  closeLightbox();
}

function renderKycDrawer() {
  const d = (ui.data.drivers || []).find((x) => x.id === ui.kycId);
  if (!d) return;
  const st = d.docStatus || kycProgress(d.docs || {}, d.idType);
  setText('kyc-name', d.name);
  setText('kyc-meta', `${d.phone || ''} · ${d.city || ''} · ${d.car || ''}`);
  const box = document.getElementById('kyc-completeness');
  if (box) {
    box.className = `kyc-complete ${st.complete ? '' : 'bad'}`;
    box.textContent = st.complete
      ? `ເອກະສານຄົບ ${st.have}/${st.need}`
      : `ຍັງຂາດ ${st.need - st.have} ລາຍການ (${st.have}/${st.need})`;
  }
  const idLabel = d.idType === 'passport' ? 'ພາສປອດ' : 'ບັດປະຈຳຕົວ';
  document.getElementById('kyc-profile').innerHTML = [
    ['ປະເພດເອກະສານ', idLabel],
    ['ເລກບັດ / ພາສປອດ', d.idNumber || '—'],
    ['ເລກໃບຂັບຂີ່', d.licenseNumber || '—'],
    ['ທະບຽນ', d.plate || '—'],
    ['ສີ / ປີ', [d.color, d.year].filter(Boolean).join(' · ') || '—'],
    ['ສະຖານະ', statusDriver(d.status)]
  ]
    .map(([k, v]) => `<p><span>${esc(k)}</span>${esc(v)}</p>`)
    .join('');
  if (d.rejectReason) {
    document.getElementById('kyc-profile').insertAdjacentHTML(
      'beforeend',
      `<p style="grid-column:1/-1"><span>ໝາຍເຫດປະຕິເສດ</span>${esc(d.rejectReason)}</p>`
    );
  }
  document.getElementById('kyc-docs').innerHTML = KYC_GROUPS.flatMap((g) =>
    g.slots.map((slot) => {
      const has = !!(d.docs && d.docs[slot.id]);
      const req = isSlotRequired(slot, d.idType);
      const src = has
        ? `${kycDocUrl(d.id, slot.id)}&t=${d.docs[slot.id].at || Date.now()}`
        : '';
      return `<figure class="kyc-admin-card ${has ? '' : 'miss'}" ${
        src ? `data-preview="${src}"` : ''
      }>
        ${src ? `<img src="${src}" alt="">` : `<div class="ph">${req ? 'ຍັງບໍ່ອັບ' : 'ບໍ່ມີ'}</div>`}
        <figcaption>${esc(slot.title)}${req ? ' · ຈຳເປັນ' : ''}</figcaption>
      </figure>`;
    })
  ).join('');
}

function statusDriver(status) {
  if (status === 'approved') return 'ອະນຸມັດ';
  if (status === 'pending') return 'ລໍຖ້າກວດ';
  if (status === 'rejected') return 'ປະຕິເສດ';
  return status || '—';
}

async function decideKyc(reject) {
  if (!ui.kycId) return;
  const note = document.getElementById('kyc-note')?.value.trim() || '';
  try {
    await adminSetDriver(ui.kycId, reject, note);
    toast(reject ? 'ປະຕິເສດຄຳຂໍແລ້ວ' : 'ອະນຸມັດຄົນຂັບແລ້ວ');
    closeKyc();
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

function openLightbox(src) {
  const box = document.getElementById('kyc-lightbox');
  const img = document.getElementById('kyc-lightbox-img');
  if (img) img.src = src;
  box?.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('kyc-lightbox')?.classList.add('hidden');
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('lo-LA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusLo(o) {
  if (o.status === 'matched') return `ເດີນທາງ · ${o.phase || ''}`;
  if (o.status === 'bidding') return `ປະມູນ · ${o.bids?.length || 0}`;
  if (o.status === 'open') return 'ລໍຖ້າຄົນຂັບ';
  if (o.status === 'completed') return 'ສຳເລັດ';
  if (o.status === 'cancelled') return 'ຍົກເລີກ';
  return o.status;
}

function badge(o) {
  const map = {
    open: ['b-open', 'ເປີດ'],
    bidding: ['b-bid', 'ປະມູນ'],
    matched: ['b-match', 'ສົດ'],
    completed: ['b-done', 'ສຳເລັດ'],
    cancelled: ['b-cancel', 'ຍົກເລີກ']
  };
  const [cls, label] = map[o.status] || ['b-wait', o.status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function driverBadge(status) {
  if (status === 'approved') return '<span class="badge b-done">ອະນຸມັດ</span>';
  if (status === 'pending') return '<span class="badge b-wait">ລໍຖ້າ</span>';
  if (status === 'draft') return '<span class="badge b-bid">ຮ່າງ</span>';
  return '<span class="badge b-cancel">ປະຕິເສດ</span>';
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
