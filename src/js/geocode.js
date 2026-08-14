/** Nominatim geocoding + reverse geocode + map place selection */
import { ST } from './state.js';
import { LANDMARKS } from './data/locations.js';
import {
  placePickup,
  placeDest,
  calcRoute,
  flyTo,
  setMapPickMode,
  getMapPickMode,
  refreshMapPickUI
} from './map.js';
import { toast } from './ui.js';

const debounce = {};
let onPlaceChanged = null;

export function setOnPlaceChanged(fn) {
  onPlaceChanged = typeof fn === 'function' ? fn : null;
}

function notifyPlaceChanged() {
  onPlaceChanged?.();
}

function localSearch(q) {
  const lower = q.toLowerCase();
  return LANDMARKS.filter((l) =>
    l.display_name.toLowerCase().includes(lower)
  );
}

function nearestLandmark(lat, lng) {
  let best = null;
  let bestD = Infinity;
  LANDMARKS.forEach((l) => {
    const d =
      Math.abs(parseFloat(l.lat) - lat) + Math.abs(parseFloat(l.lon) - lng);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  });
  return bestD < 0.02 ? best : null;
}

function renderDrop(drop, results, type) {
  if (!results.length) {
    drop.classList.add('hidden');
    return;
  }
  drop.innerHTML = results
    .slice(0, 6)
    .map((r) => {
      const short =
        r.display_name.length > 48
          ? `${r.display_name.substring(0, 45)}...`
          : r.display_name;
      const safeName = r.display_name.replace(/`/g, "'").replace(/"/g, '&quot;');
      return `<div class="search-item" data-type="${type}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${safeName}"><i class="fa-solid fa-location-dot text-idrive-green text-xs shrink-0"></i><span>${short}</span></div>`;
    })
    .join('');
  drop.classList.remove('hidden');

  drop.querySelectorAll('.search-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectPlace(
        item.dataset.type,
        item.dataset.lat,
        item.dataset.lon,
        item.dataset.name
      );
    });
  });
}

export function onSearch(el, type, dropIdOverride) {
  const q = el.value.trim();
  const dropId =
    dropIdOverride || (type === 'pickup' ? 'pickup-drop' : 'dest-drop');
  const drop = document.getElementById(dropId);
  if (!drop) return;
  if (q.length < 2) {
    drop.classList.add('hidden');
    return;
  }
  clearTimeout(debounce[type]);
  debounce[type] = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=la&accept-language=lo,en`,
        { headers: { 'Accept-Language': 'lo,en' } }
      );
      const data = await res.json();
      renderDrop(drop, data.length ? data : localSearch(q), type);
    } catch {
      renderDrop(drop, localSearch(q), type);
    }
  }, 400);
}

export function onMapSearch(el) {
  const type = ST.mapFocus === 'pickup' ? 'pickup' : 'dest';
  onSearch(el, type, 'map-search-drop');
}

export function setMapSearchTarget(type) {
  ST.mapFocus = type === 'pickup' ? 'pickup' : 'dest';
  setMapPickMode(ST.mapFocus);
  refreshMapPickUI();
  syncMapSearchTargetUI();
  const inp = document.getElementById('map-search-input');
  if (inp) {
    inp.placeholder =
      ST.mapFocus === 'pickup' ? 'ຄົ້ນຫາຕົ້ນທາງ...' : 'ຄົ້ນຫາປາຍທາງ...';
    inp.focus();
  }
}

export function syncMapSearchTargetUI() {
  const pick = document.getElementById('map-target-pickup');
  const dest = document.getElementById('map-target-dest');
  const mode = ST.mapFocus || 'dest';
  pick?.classList.toggle('is-active', mode === 'pickup');
  dest?.classList.toggle('is-active', mode === 'dest');
}

export function onMapSearchFocus() {
  setMapSearchTarget(ST.mapFocus || 'dest');
}

export async function reverseGeocode(lat, lng) {
  const near = nearestLandmark(lat, lng);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=lo,en&zoom=18`,
      { headers: { 'Accept-Language': 'lo,en' } }
    );
    const data = await res.json();
    if (data?.display_name) {
      const name = data.display_name;
      return name.length > 56 ? `${name.substring(0, 53)}...` : name;
    }
  } catch {
    /* fall through */
  }
  if (near) return near.display_name;
  return `ຈຸດເລືອກ ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function selectPlace(type, lat, lng, name) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);
  document
    .getElementById(type === 'pickup' ? 'pickup-drop' : 'dest-drop')
    ?.classList.add('hidden');
  document.getElementById('map-search-drop')?.classList.add('hidden');
  const short = name.length > 50 ? `${name.substring(0, 47)}...` : name;
  const mapInp = document.getElementById('map-search-input');
  if (mapInp) mapInp.value = short;
  if (type === 'pickup') {
    ST.pickup = { lat, lng, name };
    const inp = document.getElementById('pickup-input');
    if (inp) inp.value = short;
    placePickup(lat, lng);
    flyTo(lat, lng, 15);
  } else {
    ST.dest = { lat, lng, name };
    const inp = document.getElementById('dest-input');
    if (inp) inp.value = short;
    placeDest(lat, lng);
    flyTo(lat, lng, 14);
  }
  if (ST.pickup && ST.dest) calcRoute();
  notifyPlaceChanged();
  // After picking from map search, nudge to the other field
  if (type === 'pickup' && !ST.dest) {
    setMapSearchTarget('dest');
  }
}

/** Place from map tap / drag — with reverse geocode */
export async function applyMapPoint(type, lat, lng, { silent = false } = {}) {
  const loadingLabel = type === 'pickup' ? 'pickup-input' : 'dest-input';
  const inp = document.getElementById(loadingLabel);
  if (inp) inp.value = '📡 ກຳລັງຫາຊື່ສະຖານທີ່...';

  if (type === 'pickup') {
    ST.pickup = { lat, lng, name: '...' };
    placePickup(lat, lng);
  } else {
    ST.dest = { lat, lng, name: '...' };
    placeDest(lat, lng);
  }

  const name = await reverseGeocode(lat, lng);
  const short = name.length > 50 ? `${name.substring(0, 47)}...` : name;
  if (type === 'pickup') {
    ST.pickup = { lat, lng, name };
    if (inp) inp.value = short;
  } else {
    ST.dest = { lat, lng, name };
    if (inp) inp.value = short;
  }
  const mapInp = document.getElementById('map-search-input');
  if (mapInp) mapInp.value = short;

  if (ST.pickup && ST.dest) calcRoute();
  if (!silent) {
    toast(
      type === 'pickup'
        ? '📍 ຕັ້ງຕົ້ນທາງຈາກແຜນທີ່ແລ້ວ'
        : '🏁 ຕັ້ງປາຍທາງຈາກແຜນທີ່ແລ້ວ'
    );
  }

  // Auto-advance: after setting pickup, switch to dest pick mode
  if (type === 'pickup' && getMapPickMode() === 'pickup') {
    ST.mapFocus = 'dest';
    setMapPickMode('dest');
  }
  syncMapSearchTargetUI();
  notifyPlaceChanged();
}

export function setPickTarget(type, { silent = false } = {}) {
  ST.mapFocus = type === 'pickup' ? 'pickup' : 'dest';
  setMapPickMode(ST.mapFocus);
  if (!silent) {
    const label =
      ST.mapFocus === 'pickup'
        ? 'ແຕະແຜນທີ່ເພື່ອເລືອກຕົ້ນທາງ'
        : 'ແຕະແຜນທີ່ເພື່ອເລືອກປາຍທາງ';
    toast(`🗺️ ${label}`);
  }
  refreshMapPickUI();
  syncMapSearchTargetUI();
}

export function confirmMapCenter() {
  const map = window.__idriveMap;
  if (!map) return;
  const c = map.getCenter();
  const mode = getMapPickMode() || 'dest';
  applyMapPoint(mode, c.lat, c.lng);
}

export function swapLocations() {
  [ST.pickup, ST.dest] = [ST.dest, ST.pickup];
  document.getElementById('pickup-input').value = ST.pickup?.name || '';
  document.getElementById('dest-input').value = ST.dest?.name || '';
  if (ST.pickup) placePickup(ST.pickup.lat, ST.pickup.lng);
  if (ST.dest) placeDest(ST.dest.lat, ST.dest.lng);
  if (ST.pickup && ST.dest) calcRoute();
  notifyPlaceChanged();
  toast('🔄 ສະຫຼັບຈຸດຮັບ/ຈຸດສົ່ງ');
}

export function bindSearchDismiss() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#pickup-input') && !e.target.closest('#pickup-drop')) {
      document.getElementById('pickup-drop')?.classList.add('hidden');
    }
    if (!e.target.closest('#dest-input') && !e.target.closest('#dest-drop')) {
      document.getElementById('dest-drop')?.classList.add('hidden');
    }
    if (
      !e.target.closest('#map-search-input') &&
      !e.target.closest('#map-search-drop')
    ) {
      document.getElementById('map-search-drop')?.classList.add('hidden');
    }
  });

  // Focusing an input activates that pick mode (silent — no toast spam)
  document.getElementById('pickup-input')?.addEventListener('focus', () => {
    ST.mapFocus = 'pickup';
    setMapPickMode('pickup');
    refreshMapPickUI();
  });
  document.getElementById('dest-input')?.addEventListener('focus', () => {
    ST.mapFocus = 'dest';
    setMapPickMode('dest');
    refreshMapPickUI();
  });
}
