/** Home booking sheet steps — location first, then ride options */
import { ST } from './state.js';
import { LANDMARKS } from './data/locations.js';
import { selectPlace, setPickTarget, setOnPlaceChanged, applyMapPoint } from './geocode.js';
import { setMapPickMode, refreshMapPickUI } from './map.js';
import { toast } from './ui.js';

let sheetStep = 'location'; // location | ride

export function getSheetStep() {
  return sheetStep;
}

export function renderQuickPlaces() {
  const box = document.getElementById('quick-places');
  if (!box) return;
  const top = LANDMARKS.slice(0, 6);
  box.innerHTML = top
    .map(
      (l) =>
        `<button type="button" class="quick-place" data-lat="${l.lat}" data-lon="${l.lon}" data-name="${l.display_name.replace(/"/g, '&quot;')}">
          <i class="fa-solid fa-location-dot"></i>
          <span>${shortLabel(l.display_name)}</span>
        </button>`
    )
    .join('');

  box.querySelectorAll('.quick-place').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = ST.mapFocus || 'dest';
      selectPlace(mode, btn.dataset.lat, btn.dataset.lon, btn.dataset.name);
      toast(mode === 'pickup' ? '📍 ຕັ້ງຕົ້ນທາງແລ້ວ' : '🏁 ຕັ້ງປາຍທາງແລ້ວ');
      if (mode === 'pickup') setPickTarget('dest');
      syncLocSummary();
    });
  });
}

function shortLabel(name) {
  const part = name.split(',')[0].trim();
  return part.length > 16 ? `${part.slice(0, 14)}…` : part;
}

export function syncLocSummary() {
  const p = document.getElementById('sum-pickup');
  const d = document.getElementById('sum-dest');
  if (p) p.textContent = shortAddress(ST.pickup?.name) || 'ເລືອກຕົ້ນທາງ';
  if (d) d.textContent = shortAddress(ST.dest?.name) || 'ເລືອກປາຍທາງ';

  const ready = Boolean(ST.pickup && ST.dest);
  const next = document.getElementById('btn-to-ride');
  if (next) {
    next.disabled = !ready;
    next.classList.toggle('opacity-40', !ready);
    next.classList.toggle('pointer-events-none', !ready);
  }
}

function shortAddress(name) {
  if (!name) return '';
  const part = name.split(',')[0].trim();
  return part.length > 28 ? `${part.slice(0, 26)}…` : part;
}

export function showLocationStep() {
  sheetStep = 'location';
  document.getElementById('loc-step')?.classList.remove('hidden');
  document.getElementById('ride-step')?.classList.add('hidden');
  document.getElementById('map-chrome')?.classList.remove('chrome-compact');
  setMapPickMode(ST.mapFocus || 'dest');
  refreshMapPickUI();
  syncLocSummary();
  setMapPicking(true);
  window.setSheetSnap?.('mid');
}

export function showRideStep() {
  if (!ST.pickup || !ST.dest) {
    toast('⚠️ ເລືອກຕົ້ນທາງ ແລະ ປາຍທາງກ່ອນ');
    return;
  }
  sheetStep = 'ride';
  document.getElementById('loc-step')?.classList.add('hidden');
  document.getElementById('ride-step')?.classList.remove('hidden');
  document.getElementById('map-chrome')?.classList.add('chrome-compact');
  setMapPicking(false);
  syncLocSummary();
  window.sizeSheetForRide?.();
  setTimeout(() => {
    document.querySelector('#ride-step .ride-scroll')?.scrollTo?.(0, 0);
    window.fitActiveRoute?.();
    window.__idriveMap?.invalidateSize?.({ animate: false });
  }, 340);
}

export function focusLocField(type) {
  ST.mapFocus = type === 'pickup' ? 'pickup' : 'dest';
  setPickTarget(ST.mapFocus, { silent: true });
  setMapPicking(true);
  const id = type === 'pickup' ? 'pickup-input' : 'dest-input';
  document.getElementById(id)?.focus();
}

export function setMapPicking(on) {
  document.getElementById('map-crosshair')?.classList.toggle('hidden', !on);
  document.getElementById('map-pick-hint')?.classList.toggle('hidden', !on);
  document.querySelector('#screen-home main')?.classList.toggle('is-picking', on);
}

export function bootBookingUI() {
  ST.mapFocus = 'pickup';
  setOnPlaceChanged(syncLocSummary);
  renderQuickPlaces();
  syncLocSummary();
  showLocationStep();
  requestRealPickup();
}

/** Prefer GPS as real pickup when available; leave dest empty */
function requestRealPickup() {
  if (!navigator.geolocation) return;
  const inp = document.getElementById('pickup-input');
  if (inp && !ST.pickup) inp.placeholder = 'ກຳລັງຫາຕຳແໜ່ງປັດຈຸບັນ...';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (ST.pickup) return; // user already chose
      const { latitude: lat, longitude: lng } = pos.coords;
      await applyMapPoint('pickup', lat, lng, { silent: true });
      ST.mapFocus = 'dest';
      setPickTarget('dest', { silent: true });
      syncLocSummary();
      toast('📍 ໃຊ້ຕຳແໜ່ງປັດຈຸບັນເປັນຕົ້ນທາງ — ເລືອກປາຍທາງຕໍ່ໄປ');
      if (inp) inp.placeholder = 'ຈຸດຮັບຂອງທ່ານ';
    },
    () => {
      if (inp) inp.placeholder = 'ຈຸດຮັບຂອງທ່ານ';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}
