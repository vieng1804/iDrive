/** Real map tiles + OSRM routing + live driver movement */
import { ST, BASE_FARE, FARE_PER_KM } from './state.js';
import { VIENTIANE, DRIVERS } from './data/locations.js';
import { toast } from './ui.js';

const L = window.L;

export const MAP_STYLES = [
  {
    name: 'Dark Mode',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap © CARTO'
  },
  {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap'
  },
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri'
  }
];

let map;
let tileLayer;
let pickupMarker;
let destMarker;
export let driverMarker;
let routeControl;
let animInt;
let nearbyMarkers = [];
let nearbyTimer;
let pickMode = 'dest'; // 'pickup' | 'dest'
let mapPlaceHandler = null;
let pickPulse = null;

export function setMapPlaceHandler(fn) {
  mapPlaceHandler = fn;
}

export function getMapPickMode() {
  return pickMode;
}

export function setMapPickMode(mode) {
  pickMode = mode === 'pickup' ? 'pickup' : 'dest';
  refreshMapPickUI();
  if (map?._container) {
    map._container.classList.toggle('map-pick-pickup', pickMode === 'pickup');
    map._container.classList.toggle('map-pick-dest', pickMode === 'dest');
  }
}

export function refreshMapPickUI() {
  const hint = document.getElementById('map-pick-hint-text');
  document.querySelectorAll('[data-pick]').forEach((btn) => {
    const on = btn.dataset.pick === pickMode;
    btn.classList.toggle('pick-active', on);
  });
  if (hint) {
    hint.textContent =
      pickMode === 'pickup'
        ? 'ແຕະແຜນທີ່ ຫຼື ລາກໝุดຂຽວ — ຕັ້ງຕົ້ນທາງ'
        : 'ແຕະແຜນທີ່ ຫຼື ລາກໝุดແດງ — ຕັ້ງປາຍທາງ';
  }
  const cross = document.getElementById('map-crosshair');
  if (cross) {
    cross.classList.toggle('crosshair-pickup', pickMode === 'pickup');
    cross.classList.toggle('crosshair-dest', pickMode === 'dest');
  }
}

function emitMapPlace(type, lat, lng) {
  if (typeof mapPlaceHandler === 'function') {
    mapPlaceHandler(type, lat, lng);
  }
}

function showTapPulse(latlng) {
  if (!map || !L) return;
  if (pickPulse) {
    map.removeLayer(pickPulse);
    pickPulse = null;
  }
  const color = pickMode === 'pickup' ? '#00FF66' : '#EF4444';
  pickPulse = L.circleMarker(latlng, {
    radius: 12,
    color,
    fillColor: color,
    fillOpacity: 0.35,
    weight: 2,
    className: 'map-tap-pulse'
  }).addTo(map);
  setTimeout(() => {
    if (pickPulse) {
      map.removeLayer(pickPulse);
      pickPulse = null;
    }
  }, 600);
}

function mkIcon(bg, fa, size = 32) {
  return L.divIcon({
    className: 'custom-pin',
    html: `<div class="map-pin-dot" style="--pin-bg:${bg};width:${size}px;height:${size}px"><i class="${fa}"></i></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

/** Pickup / destination pins with clear Lao labels above the marker */
function mkLabeledPin({ bg, fa, label, tone = 'pickup', size = 36 }) {
  const width = 96;
  const labelH = 30;
  const gap = 6;
  const height = labelH + gap + size;
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div class="map-pin map-pin--${tone}" style="--pin-bg:${bg};width:${width}px;height:${height}px">
        <span class="map-pin-label">${label}</span>
        <span class="map-pin-dot" style="width:${size}px;height:${size}px">
          <i class="${fa}"></i>
        </span>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [width / 2, height - size / 2],
    popupAnchor: [0, -(size / 2 + labelH)]
  });
}

function mkDriverIcon(active = false) {
  const bg = active ? '#FACC15' : '#94a3b8';
  const size = active ? 44 : 34;
  return L.divIcon({
    className: 'custom-pin',
    html: `<div class="${active ? 'driver-car' : ''}" style="width:${size}px;height:${size}px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;border:2px solid #1a1a1a;box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:${active ? 1 : 0.85}"><i class="fa-solid fa-car" style="color:#06090E;font-size:${active ? 18 : 13}px"></i></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

export function getMap() {
  return map;
}

export function placePickup(lat, lng) {
  if (!map) return;
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = L.marker([lat, lng], {
    icon: mkLabeledPin({
      bg: '#00FF66',
      fa: 'fa-solid fa-location-dot',
      label: 'ຕົ້ນທາງ',
      tone: 'pickup',
      size: 36
    }),
    draggable: true,
    autoPan: true,
    title: 'ຕົ້ນທາງ — ລາກເພື່ອຍ້າຍ'
  })
    .addTo(map)
    .bindPopup('<b>ຕົ້ນທາງ (Pick-up)</b><br><span style="font-size:11px;opacity:.8">ລາກໝุดເພື່ອປັບ</span>');

  pickupMarker.on('dragstart', () => {
    setMapPickMode('pickup');
  });
  pickupMarker.on('dragend', (e) => {
    const { lat, lng } = e.target.getLatLng();
    emitMapPlace('pickup', lat, lng);
  });
  pickupMarker.on('click', () => {
    setMapPickMode('pickup');
    toast('📍 ໂໝດເລືອກຕົ້ນທາງ — ແຕະແຜນທີ່ຫຼືລາກໝุด');
  });
}

export function placeDest(lat, lng) {
  if (!map) return;
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([lat, lng], {
    icon: mkLabeledPin({
      bg: '#EF4444',
      fa: 'fa-solid fa-flag-checkered',
      label: 'ປາຍທາງ',
      tone: 'dest',
      size: 36
    }),
    draggable: true,
    autoPan: true,
    title: 'ປາຍທາງ — ລາກເພື່ອຍ້າຍ'
  })
    .addTo(map)
    .bindPopup('<b>ປາຍທາງ (Destination)</b><br><span style="font-size:11px;opacity:.8">ລາກໝุดເພື່ອປັບ</span>');

  destMarker.on('dragstart', () => {
    setMapPickMode('dest');
  });
  destMarker.on('dragend', (e) => {
    const { lat, lng } = e.target.getLatLng();
    emitMapPlace('dest', lat, lng);
  });
  destMarker.on('click', () => {
    setMapPickMode('dest');
    toast('🏁 ໂໝດເລືອກປາຍທາງ — ແຕະແຜນທີ່ຫຼືລາກໝุด');
  });
}

export function setDriverPos(lat, lng, popup) {
  if (!map) return;
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], { icon: mkDriverIcon(true) }).addTo(map);
  } else {
    driverMarker.setLatLng([lat, lng]);
    driverMarker.setIcon(mkDriverIcon(true));
  }
  if (popup) driverMarker.bindPopup(popup);
}

export function updateFares(km) {
  ['ride', 'moto', 'comfort', 'suv'].forEach((v) => {
    const f =
      km > 0
        ? Math.ceil((BASE_FARE[v] + FARE_PER_KM[v] * km) / 1000) * 1000
        : BASE_FARE[v];
    const priceEl = document.getElementById(`price-${v}`);
    if (priceEl) priceEl.innerText = `${f.toLocaleString()} ₭`;
    if (v === ST.vehicle) {
      ST.fare = f;
      const fareInput = document.getElementById('fare-input');
      if (fareInput) fareInput.value = f;
      const sug = document.getElementById('suggested-label');
      if (sug) sug.innerText = `ແນະນຳ: ${f.toLocaleString()} ₭`;
      const badge = document.getElementById('route-fare-badge');
      if (badge)
        badge.innerHTML = `<i class="fa-solid fa-coins"></i> ${f.toLocaleString()} ₭`;
    }
  });
}

export function calcRoute() {
  if (!ST.pickup || !ST.dest || !map || !L.Routing) return;
  const loading = document.getElementById('route-loading');
  if (loading) loading.classList.remove('hidden');

  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }

  routeControl = L.Routing.control({
    waypoints: [
      L.latLng(ST.pickup.lat, ST.pickup.lng),
      L.latLng(ST.dest.lat, ST.dest.lng)
    ],
    router: L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1',
      profile: 'driving'
    }),
    lineOptions: {
      styles: [{ color: '#00FF66', weight: 5, opacity: 0.85, dashArray: '8,8' }]
    },
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    showAlternatives: false,
    createMarker: () => null
  });

  routeControl.on('routesfound', (e) => {
    const r = e.routes[0];
    const distKm = (r.summary.totalDistance / 1000).toFixed(1);
    const timeMins = Math.round(r.summary.totalTime / 60);
    ST.routeDistance = distKm;
    ST.routeTime = timeMins;
    updateFares(parseFloat(distKm));
    document.getElementById('route-dist').innerHTML =
      `<i class="fa-solid fa-road"></i> ${distKm} ກມ`;
    document.getElementById('route-time').innerHTML =
      `<i class="fa-solid fa-clock"></i> ${timeMins} ນທ`;
    document.getElementById('route-fare-badge') &&
      (document.getElementById('route-fare-badge').innerHTML =
        `<i class="fa-solid fa-coins"></i> ${ST.fare.toLocaleString()} ₭`);
    document.getElementById('route-bar').classList.remove('hidden');
    if (loading) loading.classList.add('hidden');
    const td = document.getElementById('trip-distance');
    if (td) td.innerText = `${distKm} ກມ`;
  });

  routeControl.on('routingerror', () => {
    if (loading) loading.classList.add('hidden');
    toast('⚠️ OSRM routing error — ກວດອິນເຕີເນັດ');
  });

  routeControl.addTo(map);
}

function spawnNearbyDrivers() {
  if (!map) return;
  nearbyMarkers.forEach((m) => map.removeLayer(m));
  nearbyMarkers = [];
  const base = ST.pickup || { lat: VIENTIANE[0], lng: VIENTIANE[1] };
  DRIVERS.forEach((d, i) => {
    const lat = base.lat + (Math.random() - 0.5) * 0.018;
    const lng = base.lng + (Math.random() - 0.5) * 0.018;
    const m = L.marker([lat, lng], { icon: mkDriverIcon(false) })
      .addTo(map)
      .bindPopup(`<b>${d.name}</b><br>${d.car}`);
    m._drift = { lat, lng, phase: Math.random() * Math.PI * 2, speed: 0.00004 + i * 0.00001 };
    nearbyMarkers.push(m);
  });
}

function tickNearby() {
  nearbyMarkers.forEach((m) => {
    if (!m._drift) return;
    m._drift.phase += 0.05;
    const lat = m._drift.lat + Math.sin(m._drift.phase) * 0.0012;
    const lng = m._drift.lng + Math.cos(m._drift.phase * 0.8) * 0.0012;
    m.setLatLng([lat, lng]);
  });
}

export function initMap(containerId = 'map') {
  if (!L) {
    console.error('Leaflet is not loaded');
    return;
  }

  map = L.map(containerId, { zoomControl: false }).setView(VIENTIANE, 14);
  window.__idriveMap = map;
  const style = MAP_STYLES[0];
  tileLayer = L.tileLayer(style.url, {
    maxZoom: 19,
    attribution: style.attr,
    subdomains: 'abcd'
  }).addTo(map);

  // Real empty start — no mock pickup/destination
  ST.pickup = null;
  ST.dest = null;
  ST.mapFocus = 'pickup';
  const pickupInp = document.getElementById('pickup-input');
  const destInp = document.getElementById('dest-input');
  if (pickupInp) pickupInp.value = '';
  if (destInp) destInp.value = '';
  document.getElementById('route-bar')?.classList.add('hidden');

  setDriverPos(17.958, 102.608, '<b>ຄົນຂັບ iDrive</b>');
  spawnNearbyDrivers();
  nearbyTimer = setInterval(tickNearby, 1200);

  // Tap map to set pickup / destination
  map.on('click', (e) => {
    const trip = document.getElementById('trip-view');
    const searching = document.getElementById('searching-view');
    const rideStep = document.getElementById('ride-step');
    if (trip && !trip.classList.contains('hidden')) return;
    if (searching && !searching.classList.contains('hidden')) return;
    // On ride options step, map taps shouldn't change locations
    if (rideStep && !rideStep.classList.contains('hidden')) return;
    if (ST.role === 'driver') return;
    const { lat, lng } = e.latlng;
    showTapPulse(e.latlng);
    emitMapPlace(pickMode, lat, lng);
  });

  setMapPickMode('pickup');
  refreshMapPickUI();
  setTimeout(() => map.invalidateSize(), 150);
}

export function toggleMapStyle() {
  if (!map || !tileLayer) return;
  ST.mapStyleIdx = (ST.mapStyleIdx + 1) % MAP_STYLES.length;
  const s = MAP_STYLES[ST.mapStyleIdx];
  map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(s.url, {
    maxZoom: 19,
    attribution: s.attr,
    subdomains: 'abcd'
  }).addTo(map);
  const lbl = document.getElementById('map-style-label');
  if (lbl) lbl.innerText = s.name;
  toast(`🗺️ ${s.name}`);
}

export function recenterMap() {
  if (!map || !ST.pickup) return;
  map.flyTo([ST.pickup.lat, ST.pickup.lng], 15, { animate: true, duration: 1 });
  toast('📍 ໂຟກັສຈຸດຮັບ');
}

export function getCurrentLocation() {
  if (!navigator.geolocation) {
    toast('GPS ບໍ່ຮອງຮັບ');
    return;
  }
  toast('📡 ດຶງ GPS...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      placePickup(lat, lng);
      map.flyTo([lat, lng], 15);
      document.getElementById('pickup-input').value = 'ຕຳແໜ່ງ GPS ປັດຈຸບັນ';
      ST.pickup = { lat, lng, name: 'ຕຳແໜ່ງ GPS ປັດຈຸບັນ' };
      spawnNearbyDrivers();
      emitMapPlace('pickup', lat, lng);
      setMapPickMode('dest');
      toast('✅ GPS ສຳເລັດ — ເລືອກປາຍທາງຕໍ່ໄປ');
    },
    () => toast('❌ GPS ຖືກປ່ຽງ')
  );
}

export function flyTo(lat, lng, zoom = 15) {
  if (map) map.flyTo([lat, lng], zoom);
}

/** Fit pickup→dest in the visible map area above the bottom sheet */
export function fitActiveRoute() {
  if (!map || !ST.pickup || !ST.dest || !L) return;
  const sheetH =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sheet-h'),
      10
    ) || 320;
  const bounds = L.latLngBounds(
    [ST.pickup.lat, ST.pickup.lng],
    [ST.dest.lat, ST.dest.lng]
  );
  map.invalidateSize({ animate: false });
  map.fitBounds(bounds, {
    animate: true,
    paddingTopLeft: [28, 72],
    paddingBottomRight: [28, Math.max(100, sheetH + 24)],
    maxZoom: 15
  });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** InDrive-like: drive to pickup, then to destination */
export function animateDriverTrip({ from, pickup, dest, onPhase, onDone }) {
  stopDriverAnim();
  let leg = 0;
  let p = 0;
  const legs = [
    {
      from,
      to: pickup,
      label: 'ຄົນຂັບກຳລັງມາຮັບ...',
      sub: 'ກະລຸນາລໍຖ້າຢູ່ຈຸດຮັບ',
      phase: 'to_pickup'
    },
    {
      from: pickup,
      to: dest,
      label: 'ກຳລັງເດີນທາງໄປຈຸດໝາຍ...',
      sub: 'ນັ່ງຄົນຂັບແລ້ວ',
      phase: 'onboard'
    }
  ];

  if (onPhase) onPhase(legs[0].phase, legs[0].label, legs[0].sub);
  setDriverPos(from.lat, from.lng);

  const tick = () => {
    const cur = legs[leg];
    p = Math.min(1, p + (leg === 0 ? 0.05 : 0.035));
    setDriverPos(
      lerp(cur.from.lat, cur.to.lat, p),
      lerp(cur.from.lng, cur.to.lng, p)
    );

    const rem = Math.max(
      1,
      Math.round((ST.routeTime || 8) * (leg === 0 ? 0.4 : 1) * (1 - p))
    );
    const eta = document.getElementById('eta-badge');
    if (eta) eta.innerText = `⏱ ${rem} ນທ`;

    if (p < 1) return;

    if (leg === 0) {
      clearInterval(animInt);
      animInt = null;
      if (onPhase) onPhase('waiting', 'ຄົນຂັບຮອດຈຸດຮັບແລ້ວ', 'ກະລຸນາຂຶ້ນລົດ');
      setTimeout(() => {
        leg = 1;
        p = 0;
        if (onPhase) onPhase('onboard', legs[1].label, legs[1].sub);
        animInt = setInterval(tick, 500);
      }, 1500);
      return;
    }

    clearInterval(animInt);
    animInt = null;
    if (onPhase)
      onPhase('arrived', 'ຮອດຈຸດໝາຍແລ້ວ ✅', 'ກະລຸນາຊຳລະ & ໃຫ້ຄະແນນ');
    if (eta) eta.innerText = '✅ ຮອດ';
    if (onDone) onDone();
  };

  animInt = setInterval(tick, 500);
}

export function stopDriverAnim() {
  if (animInt) clearInterval(animInt);
  animInt = null;
}

/** Back-compat wrapper */
export function animateDriver(onDone) {
  if (!ST.pickup || !ST.dest) return;
  const from = {
    lat: ST.pickup.lat + 0.008,
    lng: ST.pickup.lng - 0.006
  };
  animateDriverTrip({
    from,
    pickup: ST.pickup,
    dest: ST.dest,
    onPhase: (phase, label, sub) => {
      const s = document.getElementById('trip-status');
      const u = document.getElementById('trip-sub');
      if (s) s.innerText = label;
      if (u) u.innerText = sub;
      ST.tripPhase = phase;
    },
    onDone
  });
}
