/** Draggable passenger bottom sheet + map expand */
import { ST } from './state.js';
import { syncMapSearchTargetUI } from './geocode.js';

const SNAPS = ['peek', 'mid', 'full'];
let snap = 'mid';
let prevSnap = 'mid';
let sheetEl = null;
let fabEl = null;
let dragging = false;
let startY = 0;
let startH = 0;
let bound = false;

function navOffset() {
  return 64;
}

function actionSheetKind() {
  const trip = document.getElementById('trip-view');
  const search = document.getElementById('searching-view');
  if (trip && !trip.classList.contains('hidden')) return 'trip';
  if (search && !search.classList.contains('hidden')) return 'search';
  return null;
}

function sheetMaxH() {
  return Math.min(Math.round(window.innerHeight * 0.62), 540);
}

function snapHeights() {
  // Keep map readable; action sheets stay tall enough for the primary CTA
  const vh = window.innerHeight;
  const action = actionSheetKind();
  return {
    peek: action ? 228 : 72,
    mid: action ? Math.min(Math.round(vh * 0.48), 420) : Math.min(Math.round(vh * 0.38), 320),
    full: sheetMaxH()
  };
}

function heightFor(s) {
  return snapHeights()[s] || snapHeights().mid;
}

function invalidateMap() {
  requestAnimationFrame(() => {
    window.__idriveMap?.invalidateSize?.({ animate: false });
  });
}

function syncFab() {
  if (!fabEl) return;
  const expanded = snap === 'peek';
  fabEl.classList.toggle('is-map-expanded', expanded);
  fabEl.classList.toggle('hidden', expanded);
  fabEl.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  fabEl.title = 'ຂະຫຍາຍແຜນທີ່';
  const icon = fabEl.querySelector('i');
  if (icon) icon.className = 'fa-solid fa-expand';
}

function syncExpandedUI() {
  const main = document.querySelector('#screen-home main');
  const panel = document.getElementById('map-search-panel');
  const toolsFloat = document.querySelector('.map-tools-float');
  const chromeDefault = document.querySelector('.map-chrome-default');
  const peek = snap === 'peek';
  const searchPeek = peek && !actionSheetKind();

  main?.classList.toggle('map-expanded', peek);
  panel?.classList.toggle('hidden', !searchPeek);
  toolsFloat?.classList.toggle('hidden', !searchPeek);
  chromeDefault?.classList.toggle('hidden', peek);

  if (searchPeek) {
    syncMapSearchTargetUI();
    const inp = document.getElementById('map-search-input');
    if (inp) {
      inp.placeholder =
        ST.mapFocus === 'pickup' ? 'ຄົ້ນຫາຕົ້ນທາງ...' : 'ຄົ້ນຫາປາຍທາງ...';
      setTimeout(() => inp.focus({ preventScroll: true }), 280);
    }
  } else {
    document.getElementById('map-search-drop')?.classList.add('hidden');
  }
}

export function getSheetSnap() {
  return snap;
}

export function setSheetHeight(px, { animate = true, maxPx } = {}) {
  if (!sheetEl) return;
  const hs = snapHeights();
  const max = maxPx ?? hs.full;
  const clamped = Math.max(hs.peek, Math.min(max, px));
  sheetEl.classList.toggle('sheet-dragging', !animate);
  sheetEl.style.setProperty('--sheet-h', `${clamped}px`);
  document.documentElement.style.setProperty('--sheet-h', `${clamped}px`);
  if (animate) sheetEl.classList.remove('sheet-dragging');
}

export function setSheetSnap(next, { remember = true } = {}) {
  if (ST.role === 'driver') return;
  if (!SNAPS.includes(next)) next = 'mid';
  if (remember && snap !== 'peek') prevSnap = snap;
  snap = next;
  if (!sheetEl) return;
  sheetEl.dataset.snap = snap;
  sheetEl.classList.remove('sheet-dragging');
  setSheetHeight(heightFor(snap), { animate: true });
  const action = actionSheetKind();
  sheetEl.classList.toggle('sheet-peek', snap === 'peek' && !action);
  sheetEl.classList.toggle('sheet-compact', snap === 'peek' && !!action);
  syncFab();
  syncExpandedUI();
  invalidateMap();
}

function sizeSheetToContent(contentEl, { minH = 340, pad = 14 } = {}) {
  if (!sheetEl || ST.role === 'driver') return;
  snap = 'full';
  prevSnap = 'full';
  sheetEl.dataset.snap = 'full';
  sheetEl.classList.remove('sheet-peek', 'sheet-compact');

  const maxH = sheetMaxH();
  setSheetHeight(maxH, { animate: false, maxPx: maxH });

  requestAnimationFrame(() => {
    if (!contentEl || contentEl.classList.contains('hidden')) {
      setSheetSnap('full', { remember: false });
      return;
    }
    const handle = document.getElementById('sheet-handle');
    const scroll = contentEl.querySelector('.ride-scroll, .trip-scroll, .search-scroll');
    const cta = contentEl.querySelector('.ride-cta, .trip-cta, .search-cta');
    if (scroll) scroll.scrollTop = 0;

    const needed =
      (handle?.getBoundingClientRect().height || 36) +
      (scroll ? scroll.scrollHeight : contentEl.scrollHeight) +
      (cta?.offsetHeight || 0) +
      pad;
    const h = Math.min(Math.max(needed, minH), maxH);
    setSheetHeight(h, { animate: true, maxPx: maxH });
    syncFab();
    syncExpandedUI();
    invalidateMap();
  });
}

/** Size sheet so ride controls (vehicle + fare + note + CTA) fit without dragging */
export function sizeSheetForRide() {
  sizeSheetToContent(document.getElementById('ride-step'), { minH: 360 });
}

/** Size sheet so trip status + driver + fare + complete CTA stay above the nav */
export function sizeSheetForTrip() {
  sizeSheetToContent(document.getElementById('trip-view'), { minH: 348 });
}

/** Size sheet so bid list can scroll while cancel stays tappable */
export function sizeSheetForSearch() {
  sizeSheetToContent(document.getElementById('searching-view'), { minH: 360 });
}

export function toggleMapExpand() {
  if (snap === 'peek') {
    setSheetSnap(prevSnap === 'peek' ? 'mid' : prevSnap, { remember: false });
  } else {
    prevSnap = snap;
    setSheetSnap('peek', { remember: false });
  }
}

export function expandMap() {
  if (snap !== 'peek') {
    prevSnap = snap;
    setSheetSnap('peek', { remember: false });
  }
}

export function restoreSheet() {
  if (snap === 'peek') {
    setSheetSnap(prevSnap === 'peek' ? 'mid' : prevSnap, { remember: false });
  }
}

function onPointerDown(e) {
  if (ST.role === 'driver') return;
  if (!sheetEl || sheetEl.classList.contains('hidden')) return;
  if (!e.target.closest('#sheet-handle')) return;
  dragging = true;
  startY = e.clientY;
  startH = sheetEl.getBoundingClientRect().height;
  sheetEl.classList.add('sheet-dragging');
  e.currentTarget.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging) return;
  const dy = startY - e.clientY;
  setSheetHeight(startH + dy, { animate: false });
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  const dy = Math.abs((e?.clientY ?? startY) - startY);
  if (dy < 8) {
    const i = SNAPS.indexOf(snap);
    setSheetSnap(SNAPS[(i + 1) % SNAPS.length]);
    return;
  }
  const h = sheetEl.getBoundingClientRect().height;
  const hs = snapHeights();
  let chosen = 'mid';
  if (h < (hs.peek + hs.mid) / 2) chosen = 'peek';
  else if (h > (hs.mid + hs.full) / 2) chosen = 'full';
  setSheetSnap(chosen);
}

function onResize() {
  if (snap === 'peek') {
    setSheetHeight(heightFor(snap), { animate: false });
    invalidateMap();
    return;
  }
  const kind = actionSheetKind();
  if (kind === 'trip') {
    sizeSheetForTrip();
    return;
  }
  if (kind === 'search') {
    sizeSheetForSearch();
    return;
  }
  const ride = document.getElementById('ride-step');
  if (ride && !ride.classList.contains('hidden')) {
    sizeSheetForRide();
    return;
  }
  setSheetHeight(heightFor(snap), { animate: false });
  invalidateMap();
}

export function bootSheetUI() {
  sheetEl = document.getElementById('passenger-sheet');
  fabEl = document.getElementById('map-expand-btn');
  if (!sheetEl) return;
  if (!bound) {
    bound = true;
    const handle = document.getElementById('sheet-handle');
    handle?.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
  }
  setSheetSnap('mid');
}
