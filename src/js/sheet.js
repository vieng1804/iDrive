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

function snapHeights() {
  // Keep map readable; ride sheet can go a bit taller to show all controls
  const vh = window.innerHeight;
  return {
    peek: 72,
    mid: Math.min(Math.round(vh * 0.38), 320),
    full: Math.min(Math.round(vh * 0.56), 480)
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
  const expanded = snap === 'peek';

  main?.classList.toggle('map-expanded', expanded);
  panel?.classList.toggle('hidden', !expanded);
  toolsFloat?.classList.toggle('hidden', !expanded);
  chromeDefault?.classList.toggle('hidden', expanded);

  if (expanded) {
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
  if (!SNAPS.includes(next)) next = 'mid';
  if (remember && snap !== 'peek') prevSnap = snap;
  snap = next;
  if (!sheetEl) return;
  sheetEl.dataset.snap = snap;
  sheetEl.classList.remove('sheet-dragging');
  setSheetHeight(heightFor(snap), { animate: true });
  sheetEl.classList.toggle('sheet-peek', snap === 'peek');
  syncFab();
  syncExpandedUI();
  invalidateMap();
}

/** Size sheet so ride controls (vehicle + fare + note + CTA) fit without dragging */
export function sizeSheetForRide() {
  if (!sheetEl) return;
  snap = 'full';
  prevSnap = 'full';
  sheetEl.dataset.snap = 'full';
  sheetEl.classList.remove('sheet-peek');

  const maxH = Math.min(Math.round(window.innerHeight * 0.58), 500);
  // Open tall first so content can measure its natural height
  setSheetHeight(maxH, { animate: false, maxPx: maxH });

  requestAnimationFrame(() => {
    const ride = document.getElementById('ride-step');
    const handle = document.getElementById('sheet-handle');
    if (!ride || ride.classList.contains('hidden')) {
      setSheetSnap('full', { remember: false });
      return;
    }
    const scroll = ride.querySelector('.ride-scroll');
    if (scroll) scroll.scrollTop = 0;

    const needed =
      (handle?.getBoundingClientRect().height || 36) +
      ride.scrollHeight +
      12;
    const h = Math.min(Math.max(needed, 360), maxH);
    setSheetHeight(h, { animate: true, maxPx: maxH });
    syncFab();
    syncExpandedUI();
    invalidateMap();
  });
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
