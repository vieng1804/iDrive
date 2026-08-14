/** Progressive Web App — first-visit install popup */

const SEEN_KEY = 'idrive_pwa_first_seen';

let deferredPrompt = null;
let bootScheduled = false;
let autoShown = false;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // @ts-ignore
    Boolean(navigator.standalone)
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function hasSeenFirstPrompt() {
  return localStorage.getItem(SEEN_KEY) === '1';
}

function markFirstPromptSeen() {
  localStorage.setItem(SEEN_KEY, '1');
}

function isFirstVisit() {
  return !hasSeenFirstPrompt() && !isStandalone();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function syncInstallButtons() {
  const installed = isStandalone();
  const show = !installed;

  document.querySelectorAll('[data-pwa-install]').forEach((el) => {
    el.classList.toggle('hidden', !show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  });

  document.querySelectorAll('[data-pwa-installed]').forEach((el) => {
    el.classList.toggle('hidden', !installed);
  });

  const status = document.getElementById('pwa-install-status');
  if (status) {
    if (installed) status.textContent = 'ຕິດຕັ້ງແລ້ວ · ເປີດແບບແອັບ';
    else if (deferredPrompt) status.textContent = 'ພ້ອມຕິດຕັ້ງໃສ່ໂທລະສັບ';
    else if (isIos()) status.textContent = 'ເພີ່ມໄປໜ້າຈໍຫຼັກ (iPhone)';
    else status.textContent = 'ຕິດຕັ້ງເພື່ອໃຊ້ແບບແອັບຈິງ';
  }
}

function openPopup(mode = 'install') {
  const sheet = document.getElementById('pwa-install-sheet');
  const iosHelp = document.getElementById('pwa-ios-steps');
  const androidHelp = document.getElementById('pwa-android-body');
  if (!sheet) return;

  const useIos = mode === 'ios' || (!deferredPrompt && isIos());
  iosHelp?.classList.toggle('hidden', !useIos);
  androidHelp?.classList.toggle('hidden', useIos);

  const cta = document.getElementById('pwa-install-cta');
  if (cta) {
    cta.textContent = useIos ? 'ເຂົ້າໃຈແລ້ວ' : 'ຕິດຕັ້ງດຽວນີ້';
    cta.dataset.mode = useIos ? 'ios' : 'install';
  }

  document.getElementById('pwa-mini-tip')?.classList.add('hidden');

  sheet.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}

function closePopup({ markSeen = true } = {}) {
  const sheet = document.getElementById('pwa-install-sheet');
  if (!sheet) return;
  sheet.classList.remove('is-open');
  setTimeout(() => sheet.classList.add('hidden'), 280);
  if (markSeen) markFirstPromptSeen();
  syncInstallButtons();
}

async function runInstall() {
  const cta = document.getElementById('pwa-install-cta');
  if (cta?.dataset.mode === 'ios') {
    closePopup({ markSeen: true });
    return;
  }

  if (!deferredPrompt) {
    if (isIos()) {
      openPopup('ios');
      return;
    }
    // Desktop / browsers without native prompt — still mark seen & guide
    toastSafe('💡 ເມນູໂປຣແກຣມທ່ອງເວັບ → Install app / ຕິດຕັ້ງແອັບ');
    closePopup({ markSeen: true });
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredPrompt = null;
  if (choice?.outcome === 'accepted') {
    toastSafe('✅ ກຳລັງຕິດຕັ້ງ iDrive...');
    closePopup({ markSeen: true });
  } else {
    // User closed native dialog — keep first-visit marked so popup won't spam
    closePopup({ markSeen: true });
  }
  syncInstallButtons();
}

function toastSafe(msg) {
  if (typeof window.toast === 'function') window.toast(msg);
}

function showFirstVisitPopup() {
  if (autoShown || !isFirstVisit()) return;
  autoShown = true;
  openPopup(isIos() ? 'ios' : 'install');
}

export function promptInstallApp() {
  if (isStandalone()) {
    toastSafe('✅ iDrive ຕິດຕັ້ງແລ້ວ');
    return;
  }
  if (isIos() && !deferredPrompt) {
    openPopup('ios');
    return;
  }
  openPopup('install');
}

export function dismissInstallPrompt() {
  closePopup({ markSeen: true });
}

export function bootPwaInstall() {
  if (bootScheduled) return;
  bootScheduled = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    syncInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markFirstPromptSeen();
    closePopup({ markSeen: true });
    toastSafe('🎉 ຕິດຕັ້ງ iDrive ສຳເລັດ — ເປີດຈາກໜ້າຈໍຫຼັກໄດ້ເລີຍ');
    syncInstallButtons();
  });

  document.getElementById('pwa-install-cta')?.addEventListener('click', () => {
    runInstall();
  });
  document.getElementById('pwa-install-later')?.addEventListener('click', () => {
    closePopup({ markSeen: true });
  });
  // Backdrop does NOT dismiss — important popup requires a choice

  syncInstallButtons();

  // First visit only: show important popup right away on entry
  if (isFirstVisit()) {
    setTimeout(showFirstVisitPopup, 700);
  }
}

export function hidePwaMiniTip() {
  document.getElementById('pwa-mini-tip')?.classList.add('hidden');
  markFirstPromptSeen();
}
