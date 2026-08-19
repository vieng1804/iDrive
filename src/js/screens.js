/** App screen router — full UX flow (splash → onboarding → auth → tabs) */
import { loadDB, patchDB } from './persist.js';
import { renderHistory } from './history.js';
import { refreshWalletUI, setPayment, showQR, topUpWallet } from './wallet.js';
import { toast, toggleSidebar, closeModal, openModal } from './ui.js';
import { ST } from './state.js';
import { connectLive, liveLogin, liveLogout, getLiveState, onLive, dbView } from './live/client.js';
import { isLive, currentUser } from './live/session.js';
import { renderLiveDrivers, fitOnlineDrivers } from './map.js';
import { getActiveOrder } from './marketplace.js';

let currentTab = 'home';
let onboardingStep = 0;
let mapInited = false;
let bootAppCb = null;

const ONBOARD = [
  {
    title: 'ສະເໜີລາຄາເອງ',
    desc: 'ກຳນົດຄ່າໂດຍສານຕາມໃຈ ແລ້ວໃຫ້ຄົນຂັບຕໍ່ລອງ — ແບບ inDrive ຈິງ',
    kicker: 'ຂັ້ນຕອນ 1 / 3'
  },
  {
    title: 'ແຜນທີ່ & ເສັ້ນທາງຈິງ',
    desc: 'GPS, ຄົ້ນຫາສະຖານທີ່, ແລະເສັ້ນທາງ OSRM ສົດໃນວຽງຈັນ',
    kicker: 'ຂັ້ນຕອນ 2 / 3'
  },
  {
    title: 'ປອດໄພທຸກທ່ຽວ',
    desc: 'ແຊັດ, ໂທ, SOS 1191 ແລະແຊຣ໌ Live Location ໄດ້ທັນທີ',
    kicker: 'ຂັ້ນຕອນ 3 / 3'
  }
];

export function onAppReady(cb) {
  bootAppCb = cb;
}

function dbUser(db = loadDB()) {
  const live = currentUser();
  if (live) {
    return {
      name: live.name,
      phone: live.phone,
      rating: live.rating || 4.96,
      trips: live.trips || 0
    };
  }
  return (
    db.user || {
      name: 'ຜູ້ໃຊ້ iDrive',
      phone: '',
      rating: 4.96,
      trips: 0
    }
  );
}

export function goFlow(id) {
  ['flow-splash', 'flow-onboarding', 'flow-auth', 'app-shell'].forEach((x) => {
    const el = document.getElementById(x);
    if (!el) return;
    el.classList.toggle('hidden', x !== id);
  });
  if (id === 'flow-auth') syncAuthCopy();
}

export function goTab(tab) {
  currentTab = tab;
  const tabs = ['home', 'activity', 'wallet', 'profile'];
  tabs.forEach((t) => {
    const screen = document.getElementById(`screen-${t}`);
    if (screen) screen.classList.toggle('hidden', t !== tab);
  });

  // hide secondary full screens when switching primary tabs
  ['notifications', 'help', 'promo', 'settings', 'edit-profile'].forEach((s) => {
    document.getElementById(`screen-${s}`)?.classList.add('hidden');
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('nav-active', active);
    btn.classList.toggle('text-idrive-green', active);
    btn.classList.toggle('text-gray-500', !active);
  });

  const header = document.getElementById('app-header');
  if (header) header.classList.toggle('hidden', tab !== 'home');

  if (tab === 'activity') renderActivityPage();
  if (tab === 'wallet') renderWalletPage();
  if (tab === 'profile') renderProfilePage();

  if (tab === 'home' && mapInited === false && bootAppCb) {
    /* map already inited on first enter */
  }

  // invalidate map size when returning home
  if (tab === 'home') {
    const sheet = document.getElementById('passenger-sheet');
    const booking = document.getElementById('booking-form');
    // Ensure location picker is visible when returning home (unless mid-trip)
    if (sheet && ST.role !== 'driver') {
      sheet.classList.remove('hidden');
      if (
        booking &&
        document.getElementById('trip-view')?.classList.contains('hidden') &&
        document.getElementById('searching-view')?.classList.contains('hidden')
      ) {
        booking.classList.remove('hidden');
      }
    }
    setTimeout(() => {
      try {
        const map = window.__idriveMap;
        if (map?.invalidateSize) map.invalidateSize();
      } catch {
        /* */
      }
      window.dispatchEvent(new Event('resize'));
    }, 80);
  }
}
export function openScreen(name) {
  // secondary full-page screens over tabs
  ['notifications', 'help', 'promo', 'settings', 'edit-profile', 'driver-apply'].forEach((s) => {
    document.getElementById(`screen-${s}`)?.classList.add('hidden');
  });
  const el = document.getElementById(`screen-${name}`);
  if (!el) return;
  el.classList.remove('hidden');
  if (name === 'notifications') renderNotificationsPage();
  if (name === 'edit-profile') fillEditProfile();
  if (name === 'settings') syncSettingsToggles();
  if (name === 'driver-apply') {
    import('./driverApply.js').then((m) => {
      m.renderDriverApplyStep();
      m.fillDriverApplyForm?.();
    });
  }
  toggleSidebar(false);
}

export function closeScreen(name) {
  document.getElementById(`screen-${name}`)?.classList.add('hidden');
}

function enterApp() {
  goFlow('app-shell');
  goTab('home');
  if (!mapInited && bootAppCb) {
    mapInited = true;
    bootAppCb();
  } else {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }
  refreshChrome();
}

export function refreshChrome() {
  const db = loadDB();
  const u = dbUser(db);
  const nameEls = document.querySelectorAll('[data-user-name]');
  nameEls.forEach((el) => {
    el.textContent = u.name;
  });
  const phoneEls = document.querySelectorAll('[data-user-phone]');
  phoneEls.forEach((el) => {
    el.textContent = formatPhone(u.phone);
  });
  const badge = document.getElementById('notif-badge');
  const unread = (db.notifications || []).filter((n) => !n.read).length;
  if (badge) {
    badge.classList.toggle('hidden', unread === 0);
    badge.textContent = String(unread);
  }
  import('./driverApply.js').then((m) => m.syncDriverApplyEntry());
}

function formatPhone(p) {
  const d = String(p).replace(/\D/g, '');
  if (d.length >= 10) return `+856 ${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return `+856 ${d}`;
}

/* ---------- Splash / Onboarding / Auth ---------- */

export async function startSplash() {
  goFlow('flow-splash');
  await connectLive();
  bindLiveChrome();
  setTimeout(() => {
    const db = loadDB();
    const liveUser = currentUser();
    if (!db.onboardingDone) {
      onboardingStep = 0;
      goFlow('flow-onboarding');
      renderOnboarding();
    } else if (!(db.loggedIn || liveUser)) {
      goFlow('flow-auth');
      syncAuthCopy();
    } else {
      enterApp();
    }
  }, 1600);
}

function replayObMotion(el) {
  if (!el) return;
  el.classList.remove('ob-copy-in', 'ob-cta-pulse');
  // force style recalc so CSS animations restart after flow is visible
  void el.offsetWidth;
}

function renderOnboarding() {
  const s = ONBOARD[onboardingStep];
  const flow = document.getElementById('flow-onboarding');
  const title = document.getElementById('ob-title');
  const desc = document.getElementById('ob-desc');
  const kicker = document.getElementById('ob-kicker');
  const dots = document.getElementById('ob-dots');
  const btn = document.getElementById('ob-next');
  const copy = document.getElementById('ob-copy');
  const visual = document.getElementById('ob-visual');
  if (!s) return;

  flow?.setAttribute('data-step', String(onboardingStep));
  flow?.classList.add('is-visible');

  document.querySelectorAll('.ob-scene').forEach((scene) => {
    const active = Number(scene.dataset.scene) === onboardingStep;
    scene.classList.toggle('is-active', active);
    if (active) {
      // remount active scene subtree briefly so infinite CSS animations always restart
      scene.style.animation = 'none';
      void scene.offsetWidth;
      scene.style.animation = '';
    }
  });

  if (kicker) kicker.textContent = s.kicker;
  if (title) title.textContent = s.title;
  if (desc) desc.textContent = s.desc;

  if (dots) {
    dots.innerHTML = ONBOARD.map(
      (_, i) =>
        `<button type="button" class="ob-dot ${i === onboardingStep ? 'is-on' : ''}" aria-label="ຂັ້ນຕອນ ${i + 1}" data-ob-dot="${i}"></button>`
    ).join('');
    dots.querySelectorAll('[data-ob-dot]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.obDot);
        if (Number.isFinite(idx) && idx !== onboardingStep) {
          onboardingStep = idx;
          renderOnboarding();
        }
      });
    });
  }

  if (btn) {
    btn.textContent = onboardingStep === ONBOARD.length - 1 ? 'ເລີ່ມໃຊ້ງານ' : 'ຕໍ່ໄປ';
  }

  // Restart text/CTA enter animations after paint (flow must not be display:none)
  const kick = () => {
    if (copy) {
      replayObMotion(copy);
      copy.classList.add('ob-copy-in');
    }
    if (btn) {
      replayObMotion(btn);
      btn.classList.add('ob-cta-pulse');
    }
    if (visual) {
      visual.classList.remove('ob-visual-kick');
      void visual.offsetWidth;
      visual.classList.add('ob-visual-kick');
    }
  };

  requestAnimationFrame(() => requestAnimationFrame(kick));
}

export function onboardingNext() {
  if (onboardingStep < ONBOARD.length - 1) {
    onboardingStep += 1;
    renderOnboarding();
    return;
  }
  patchDB((d) => {
    d.onboardingDone = true;
  });
  goFlow('flow-auth');
}

export function onboardingSkip() {
  patchDB((d) => {
    d.onboardingDone = true;
  });
  goFlow('flow-auth');
}

export function renderOnboardingRestart() {
  onboardingStep = 0;
  patchDB((d) => {
    d.onboardingDone = false;
  });
  goFlow('flow-onboarding');
  renderOnboarding();
  closeScreen('settings');
}

export async function submitLogin() {
  const phone = document.getElementById('auth-phone')?.value.replace(/\D/g, '') || '';
  const name = document.getElementById('auth-name')?.value.trim() || 'ຜູ້ໃຊ້ iDrive';
  if (phone.length < 8) {
    toast('⚠️ ກະລຸນາໃສ່ເບີໂທໃຫ້ຖືກ');
    return;
  }
  const otpBox = document.getElementById('auth-otp-box');
  const loginBtn = document.getElementById('auth-login-btn');
  if (otpBox?.classList.contains('hidden')) {
    otpBox.classList.remove('hidden');
    syncAuthCopy(true);
    if (loginBtn) loginBtn.textContent = getLiveState().reachable ? 'ຢືນຢັນລະຫັດ' : 'ຢືນຢັນ OTP';
    toast(getLiveState().reachable ? '🔐 ຕັ້ງ/ໃສ່ລະຫັດ 4 ໂຕ' : '📱 OTP: 1234 (ທົດສອບ)');
    return;
  }
  const otp = document.getElementById('auth-otp')?.value.trim();
  if (getLiveState().reachable) {
    if (!/^\d{4,6}$/.test(otp)) {
      toast('❌ ລະຫັດຕ້ອງເປັນ 4–6 ໂຕ');
      return;
    }
    try {
      if (loginBtn) loginBtn.textContent = 'ກຳລັງເຂົ້າ...';
      const user = await liveLogin({ phone, name, pin: otp });
      patchDB((d) => {
        d.loggedIn = true;
        d.user = {
          name: user.name,
          phone: user.phone,
          rating: user.rating,
          trips: user.trips,
          role: user.role
        };
      });
      if (user.role === 'admin') {
        toast('ກຳລັງເປີດ Admin Console...');
        window.location.href = new URL('admin/', window.location.href).href;
        return;
      }
      toast('✅ ເຂົ້າສູ່ລະບົບສົດແລ້ວ');
      enterApp();
      return;
    } catch (err) {
      if (loginBtn) loginBtn.textContent = 'ຢືນຢັນລະຫັດ';
      toast(`❌ ${err.message}`);
    }
    return;
  }
  if (otp !== '1234') {
    toast('❌ OTP ບໍ່ຖືກ — ລອງ 1234');
    return;
  }
  patchDB((d) => {
    d.loggedIn = true;
    d.user = {
      name,
      phone,
      rating: d.user?.rating || 4.96,
      trips: d.user?.trips || 0
    };
    if (!d.notifications?.length) {
      d.notifications = [
        {
          id: 1,
          title: 'ຍິນດີຕ້ອນຮັບສູ່ iDrive',
          body: 'ສະເໜີລາຄາເອງ ແລະເດີນທາງປອດໄພໃນລາວ',
          at: Date.now(),
          read: false
        },
        {
          id: 2,
          title: 'ໂປຣໂມຊັນ',
          body: 'ເຕີມ Wallet 50,000 ₭ ຮັບໂບນັດ 5%',
          at: Date.now() - 3600000,
          read: false
        }
      ];
    }
  });
  toast('✅ ເຂົ້າສູ່ລະບົບສຳເລັດ');
  enterApp();
}

function syncAuthCopy(otpVisible = false) {
  const hint = document.getElementById('auth-hint');
  const label = document.querySelector('#auth-otp-box label');
  const live = getLiveState().reachable;
  if (hint) {
    hint.textContent = live
      ? otpVisible
        ? 'ລະຫັດນີ້ໃຊ້ເຂົ້າໃໝ່ໄດ້ທຸກເຄື່ອງ — ຢ່າໃຊ້ເບີດຽວກັນກັບຄົນຂັບ'
        : 'ລະບົບສົດພ້ອມ — ກົດສືບຕໍ່ເພື່ອຕັ້ງລະຫັດ 4 ໂຕ'
      : 'ກົດສົ່ງ OTP ເພື່ອຢືນຢັນເບີ';
  }
  if (label) label.textContent = live ? 'ລະຫັດ 4 ໂຕ' : 'ລະຫັດ OTP';
  const loginBtn = document.getElementById('auth-login-btn');
  if (loginBtn && document.getElementById('auth-otp-box')?.classList.contains('hidden')) {
    loginBtn.textContent = live ? 'ສືບຕໍ່' : 'ສົ່ງ OTP';
  }
}

function bindLiveChrome() {
  onLive((s) => {
    const pill = document.getElementById('live-pill');
    if (pill) {
      pill.textContent = s.connected ? 'LIVE' : s.reachable ? 'ກຳລັງເຊື່ອມ' : 'DEMO';
      pill.classList.toggle('is-live', !!s.connected);
      pill.classList.toggle('is-demo', !s.reachable);
    }
    const adminBtn = document.getElementById('admin-entry');
    const adminProfile = document.getElementById('admin-entry-profile');
    const isAdmin = s.user?.role === 'admin';
    adminBtn?.classList.toggle('hidden', !isAdmin);
    adminProfile?.classList.toggle('hidden', !isAdmin);
    if (s.connected) {
      const order = getActiveOrder();
      renderLiveDrivers(s.drivers || [], {
        activeId: order?.status === 'matched' ? order.driverId : null
      });
    }
  });
}

export async function logout() {
  await liveLogout();
  patchDB((d) => {
    d.loggedIn = false;
  });
  toggleSidebar(false);
  goFlow('flow-auth');
  const otpBox = document.getElementById('auth-otp-box');
  if (otpBox) otpBox.classList.add('hidden');
  const loginBtn = document.getElementById('auth-login-btn');
  if (loginBtn) loginBtn.textContent = getLiveState().reachable ? 'ສືບຕໍ່' : 'ສົ່ງ OTP';
  syncAuthCopy();
  toast('ອອກຈາກລະບົບສຳເລັດ ✓');
}

/* ---------- Page renderers ---------- */

function renderActivityPage() {
  const list = document.getElementById('activity-list');
  if (!list) return;
  const history = isLive() ? dbView().history : loadDB().history;
  const tabs = document.querySelectorAll('.activity-filter');
  tabs.forEach((t) =>
    t.classList.toggle('activity-filter-active', t.dataset.filter === 'all')
  );

  if (!history.length) {
    list.innerHTML = emptyState(
      'fa-route',
      'ຍັງບໍ່ມີກິດຈະກຳ',
      'ປະກາດຮ້ອງລົດທຳອິດ ແລ້ວປະຫວັດຈະສະແດງທີ່ນີ້'
    );
    return;
  }
  list.innerHTML = history
    .map((h) => {
      const d = new Date(h.at);
      const date = d.toLocaleString('lo-LA', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `<article class="bg-idrive-card border border-idrive-border rounded-2xl p-4 space-y-2">
        <div class="flex justify-between items-start gap-2">
          <div>
            <p class="text-[10px] text-gray-500">${date}</p>
            <h3 class="font-bold text-sm mt-0.5">${h.route}</h3>
            <p class="text-[11px] text-gray-400 mt-1"><i class="fa-solid fa-user mr-1"></i>${h.driver}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="font-black text-idrive-green">${h.fare.toLocaleString()} ₭</p>
            <span class="text-[10px] text-yellow-400">★ ${h.rating || 5}</span>
          </div>
        </div>
        <div class="flex gap-2 pt-1">
          <span class="text-[10px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-bold">ສຳເລັດ</span>
          <span class="text-[10px] bg-idrive-accent text-gray-400 px-2 py-0.5 rounded-full">${h.payment || 'ເງິນສົດ'}</span>
        </div>
      </article>`;
    })
    .join('');
}

function renderWalletPage() {
  const db = loadDB();
  refreshWalletUI(db);
  const bal = document.getElementById('wallet-page-balance');
  if (bal) bal.textContent = `${db.wallet.toLocaleString()} LAK`;
  const earn = document.getElementById('wallet-page-earn');
  if (earn) earn.textContent = `${db.earnings.toLocaleString()} ₭`;
  const tx = document.getElementById('wallet-tx-list');
  if (!tx) return;
  const items = [];
  (db.history || []).slice(0, 8).forEach((h) => {
    items.push({
      title: `ທ່ຽວ: ${h.route}`,
      amount: -h.fare,
      at: h.at,
      type: 'trip'
    });
  });
  if (!items.length) {
    tx.innerHTML = `<p class="text-xs text-gray-500 text-center py-6">ຍັງບໍ່ມີທຸລະກຳ</p>`;
    return;
  }
  tx.innerHTML = items
    .map((i) => {
      const neg = i.amount < 0;
      return `<div class="flex justify-between items-center py-3 border-b border-idrive-border/60">
        <div>
          <p class="text-xs font-bold">${i.title}</p>
          <p class="text-[10px] text-gray-500">${new Date(i.at).toLocaleDateString('lo-LA')}</p>
        </div>
        <span class="font-black text-sm ${neg ? 'text-red-400' : 'text-idrive-green'}">${neg ? '' : '+'}${i.amount.toLocaleString()} ₭</span>
      </div>`;
    })
    .join('');
}

function renderProfilePage() {
  const db = loadDB();
  const u = dbUser(db);
  refreshChrome();
  const trips = document.getElementById('profile-trips');
  if (trips) trips.textContent = String(u.trips || db.tripsDone || 0);
  const rating = document.getElementById('profile-rating');
  if (rating) rating.textContent = String(u.rating || 4.96);
  const earn = document.getElementById('profile-earn');
  if (earn) earn.textContent = `${(db.earnings || 0).toLocaleString()} ₭`;
}

function renderNotificationsPage() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  const db = loadDB();
  const notes = db.notifications || [];
  if (!notes.length) {
    list.innerHTML = emptyState('fa-bell-slash', 'ບໍ່ມີການແຈ້ງເຕືອນ', 'ເມື່ອມີຂ່າວສານຈະສະແດງທີ່ນີ້');
    return;
  }
  list.innerHTML = notes
    .map(
      (n) => `<button onclick="markNotifRead(${n.id})" class="w-full text-left bg-idrive-card border ${n.read ? 'border-idrive-border' : 'border-idrive-green/40'} rounded-2xl p-4 flex gap-3">
      <div class="w-10 h-10 rounded-xl ${n.read ? 'bg-idrive-accent text-gray-400' : 'bg-idrive-green/20 text-idrive-green'} flex items-center justify-center shrink-0"><i class="fa-solid fa-bell"></i></div>
      <div class="min-w-0 flex-1">
        <div class="flex justify-between gap-2"><h4 class="font-bold text-sm">${n.title}</h4>${n.read ? '' : '<span class="w-2 h-2 rounded-full bg-idrive-green shrink-0 mt-1.5"></span>'}</div>
        <p class="text-xs text-gray-400 mt-1">${n.body}</p>
        <p class="text-[10px] text-gray-600 mt-2">${new Date(n.at).toLocaleString('lo-LA')}</p>
      </div>
    </button>`
    )
    .join('');
}

export function markNotifRead(id) {
  patchDB((d) => {
    const n = (d.notifications || []).find((x) => x.id === id);
    if (n) n.read = true;
  });
  renderNotificationsPage();
  refreshChrome();
}

export function markAllNotifsRead() {
  patchDB((d) => {
    (d.notifications || []).forEach((n) => {
      n.read = true;
    });
  });
  renderNotificationsPage();
  refreshChrome();
  toast('✓ ອ່ານທັງໝົດແລ້ວ');
}

function fillEditProfile() {
  const u = dbUser();
  const n = document.getElementById('edit-name');
  const p = document.getElementById('edit-phone');
  if (n) n.value = u.name;
  if (p) p.value = u.phone;
}

export function saveProfile() {
  const name = document.getElementById('edit-name')?.value.trim();
  const phone = document.getElementById('edit-phone')?.value.replace(/\D/g, '');
  if (!name || phone.length < 8) {
    toast('⚠️ ກະລຸນາກອກຂໍ້ມູນໃຫ້ຄົບ');
    return;
  }
  patchDB((d) => {
    d.user = { ...(d.user || {}), name, phone };
  });
  refreshChrome();
  closeScreen('edit-profile');
  renderProfilePage();
  toast('✅ ບັນທຶກໂປຣໄຟລ໌ແລ້ວ');
}

function syncSettingsToggles() {
  const db = loadDB();
  const sound = document.getElementById('set-sound');
  const notif = document.getElementById('set-notif');
  if (sound) sound.checked = db.settings?.sound !== false;
  if (notif) notif.checked = db.settings?.notif !== false;
}

export function saveSetting(key, value) {
  patchDB((d) => {
    d.settings = { ...(d.settings || {}), [key]: value };
  });
  toast('✓ ບັນທຶກການຕັ້ງຄ່າ');
}

export function copyPromo() {
  const code = 'IDRIVE50';
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => toast(`📋 ຄັດລອກ ${code}`));
  } else toast(code);
}

function emptyState(icon, title, desc) {
  return `<div class="text-center py-16 px-6">
    <div class="w-16 h-16 rounded-2xl bg-idrive-accent mx-auto flex items-center justify-center text-2xl text-gray-500 mb-4"><i class="fa-solid ${icon}"></i></div>
    <h3 class="font-bold text-sm">${title}</h3>
    <p class="text-xs text-gray-500 mt-2 leading-relaxed">${desc}</p>
    <button onclick="goTab('home')" class="mt-5 text-xs font-bold text-idrive-green">ກັບໄປຮ້ອງລົດ →</button>
  </div>`;
}

/** Bridge legacy modal openers to full pages when useful */
export function openWalletPage() {
  goTab('wallet');
  toggleSidebar(false);
  closeModal('wallet-modal');
}

export function openActivityPage() {
  goTab('activity');
  toggleSidebar(false);
  closeModal('history-modal');
}

export function openPaymentSheet() {
  refreshWalletUI();
  openModal('wallet-modal');
}

export function selectPayMethod(key, label, icon, color) {
  setPayment(key, label, icon, color);
  renderWalletPage();
}

export function walletTopUp(amount) {
  topUpWallet(amount);
  renderWalletPage();
}

export function openBCELFromWallet() {
  showQR();
}
