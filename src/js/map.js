/** Real map tiles + OSRM routing + live driver movement */
import { ST } from './state.js';
import { VIENTIANE, DRIVERS } from './data/locations.js';
import { toast } from './ui.js';
import { recommendFare, applyRecommendedFare } from './fare.js';
import { getLiveState } from './live/client.js';

const L = window.L;

export const MAP_STYLES = [
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri'
  },
  {
    name: 'Dark Mode',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap © CARTO'
  },
  {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap'
  }
];

let map;
let tileLayer;
let pickupMarker;
let destMarker;
export let driverMarker;
let routeControl;
let animInt;
const fleet = new Map();
let nearbyTimer;
let didInitialFleetFit = false;
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

function mkDriverIcon(active = false, type = 'ride', heading = 0) {
  return mkFleetIcon({ type, heading, active });
}

function vehGlyph(type) {
  return (
    {
      moto: 'fa-motorcycle',
      suv: 'fa-truck-pickup',
      comfort: 'fa-car-side',
      freight: 'fa-truck',
      courier: 'fa-box'
    }[type] || 'fa-car-side'
  );
}

function mkFleetIcon({ type = 'ride', heading = 0, active = false, demo = false }) {
  const size = active ? 48 : 40;
  return L.divIcon({
    className: 'custom-pin fleet-pin',
    html: `<div class="fleet-car ${active ? 'is-active' : ''} ${demo ? 'is-demo' : ''}" style="--rot:${heading}deg">
      <i class="fleet-pulse"></i>
      <span class="fleet-body"><i class="fa-solid ${vehGlyph(type)}"></i></span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -18]
  });
}

function fleetPopup(d) {
  const kind =
    { ride: 'ເກັງ', moto: 'ມໍໄຊ', comfort: 'ຄອມຟອດ', suv: 'SUV' }[d.vehicleType] ||
    'ລົດ';
  return `<div class="fleet-pop">
    <b>${d.name || 'ຄົນຂັບ iDrive'}</b>
    <span>${d.car || kind}</span>
    <small>${d.demo ? 'ຕົວຢ່າງ' : 'ອອນລາຍຕອນນີ້'}</small>
  </div>`;
}

function bearing(aLat, aLng, bLat, bLng) {
  const dy = bLat - aLat;
  const dx = bLng - aLng;
  if (Math.abs(dy) + Math.abs(dx) < 0.00004) return null;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function upsertFleetCar(d, active) {
  if (!map || d.lat == null || d.lng == null || !d.id) return;
  const rec = fleet.get(d.id);
  const heading = rec
    ? bearing(rec.lat, rec.lng, d.lat, d.lng) ?? rec.heading
    : 0;
  if (rec) {
    rec.marker.setLatLng([d.lat, d.lng]);
    rec.lat = d.lat;
    rec.lng = d.lng;
    rec.heading = heading;
    rec.marker.setPopupContent(fleetPopup(d));
    const el = rec.marker.getElement()?.querySelector('.fleet-car');
    if (el) {
      el.style.setProperty('--rot', `${heading}deg`);
      el.classList.toggle('is-active', !!active);
    }
    rec.marker.setZIndexOffset(active ? 900 : 420);
    return;
  }
  const marker = L.marker([d.lat, d.lng], {
    icon: mkFleetIcon({
      type: d.vehicleType,
      heading,
      active,
      demo: !!d.demo
    }),
    zIndexOffset: active ? 900 : 420,
    keyboard: false,
    title: d.name || 'ຄົນຂັບ'
  })
    .addTo(map)
    .bindPopup(fleetPopup(d), { closeButton: false, className: 'fleet-popup' });
  fleet.set(d.id, {
    marker,
    lat: d.lat,
    lng: d.lng,
    heading,
    type: d.vehicleType
  });
}

function updateFleetChip(count, demo) {
  const chip = document.getElementById('fleet-chip');
  const n = document.getElementById('fleet-count');
  const label = document.getElementById('fleet-label');
  if (n) n.textContent = String(count);
  if (label) {
    label.textContent = demo
      ? count
        ? 'ລົດຕົວຢ່າງໃກ້ທ່ານ'
        : 'ກຳລັງໂຫຼດລົດ...'
      : count
        ? 'ຄົນຂັບອອນລາຍ'
        : 'ຍັງບໍ່ມີຄົນຂັບອອນລາຍ';
  }
  chip?.classList.toggle('is-empty', !count);
  chip?.classList.toggle('is-demo', !!demo);
}

export function clearNearbyDrivers() {
  fleet.forEach((rec) => map?.removeLayer(rec.marker));
  fleet.clear();
  updateFleetChip(0, false);
}

export function renderLiveDrivers(drivers = [], { activeId = null } = {}) {
  if (!map || !L) return;
  stopDemoFleet();
  const ids = new Set();
  drivers.forEach((d) => {
    const id = d.id || d.userId;
    if (d.lat == null || d.lng == null || !id) return;
    ids.add(id);
    upsertFleetCar({ ...d, id }, id === activeId);
  });
  fleet.forEach((rec, id) => {
    if (!ids.has(id)) {
      map.removeLayer(rec.marker);
      fleet.delete(id);
    }
  });
  updateFleetChip(ids.size, false);
  maybeFitFleet(false);
}

export function fitOnlineDrivers({ silent = false, maxZoom = 15 } = {}) {
  if (!map || !L) return;
  const pts = [...fleet.values()].map((r) => r.marker.getLatLng());
  if (!pts.length) {
    if (!silent) toast('ຍັງບໍ່ມີຄົນຂັບອອນລາຍໃກ້ນີ້');
    return;
  }
  if (pts.length === 1) {
    map.flyTo(pts[0], Math.min(15, maxZoom), { duration: 0.7 });
  } else {
    map.flyToBounds(L.latLngBounds(pts).pad(0.28), {
      maxZoom,
      duration: 0.75
    });
  }
  if (!silent) toast(`🚗 ${pts.length} ຄົນຂັບອອນລາຍ`);
}

function maybeFitFleet(demo) {
  if (didInitialFleetFit || ST.pickup || ST.dest || !fleet.size) return;
  didInitialFleetFit = true;
  setTimeout(() => fitOnlineDrivers({ silent: true, maxZoom: demo ? 14 : 15 }), 280);
}

function stopDemoFleet() {
  if (nearbyTimer) {
    clearInterval(nearbyTimer);
    nearbyTimer = null;
  }
}

function spawnNearbyDrivers() {
  if (!map) return;
  const live = getLiveState();
  if (live.connected) {
    renderLiveDrivers(live.drivers || []);
    return;
  }
  clearNearbyDrivers();
  const base = ST.pickup || { lat: VIENTIANE[0], lng: VIENTIANE[1] };
  const types = ['ride', 'moto', 'comfort', 'suv', 'ride', 'moto', 'ride', 'suv'];
  Array.from({ length: 8 }, (_, i) => {
    const d = DRIVERS[i % DRIVERS.length];
    const ang = (i / 8) * Math.PI * 2;
    const rad = 0.006 + (i % 3) * 0.004;
    const lat = base.lat + Math.cos(ang) * rad;
    const lng = base.lng + Math.sin(ang) * rad * 1.15;
    upsertFleetCar(
      {
        id: `demo-${d.id}-${i}`,
        name: d.name,
        car: d.car,
        vehicleType: types[i] || 'ride',
        lat,
        lng,
        demo: true
      },
      false
    );
    const rec = fleet.get(`demo-${d.id}-${i}`);
    if (rec) rec.drift = { lat, lng, phase: ang, speed: 0.000035 + i * 0.000008 };
  });
  updateFleetChip(fleet.size, true);
  nearbyTimer = setInterval(tickNearby, 1100);
  maybeFitFleet(true);
}

function tickNearby() {
  if (getLiveState().connected) {
    stopDemoFleet();
    return;
  }
  fleet.forEach((rec) => {
    if (!rec.drift) return;
    rec.drift.phase += 0.045;
    const lat = rec.drift.lat + Math.sin(rec.drift.phase) * 0.0011;
    const lng = rec.drift.lng + Math.cos(rec.drift.phase * 0.75) * 0.0011;
    const head = bearing(rec.lat, rec.lng, lat, lng) ?? rec.heading;
    rec.marker.setLatLng([lat, lng]);
    rec.lat = lat;
    rec.lng = lng;
    rec.heading = head;
    const el = rec.marker.getElement()?.querySelector('.fleet-car');
    if (el) el.style.setProperty('--rot', `${head}deg`);
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

export function updateFares(km, minutes = ST.routeTime) {
  ['ride', 'moto', 'comfort', 'suv'].forEach((v) => {
    const rec = recommendFare({
      vehicle: v,
      km,
      minutes,
      service: ST.service,
      pickup: ST.pickup,
      dest: ST.dest
    });
    const priceEl = document.getElementById(`price-${v}`);
    if (priceEl) priceEl.innerText = `${rec.amount.toLocaleString()} ₭`;
    if (v === ST.vehicle) applyRecommendedFare(rec);
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
    updateFares(parseFloat(distKm), timeMins);
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

export function followDriverCoords(lat, lng, popup) {
  setDriverPos(lat, lng, popup);
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
  spawnNearbyDrivers();

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
  document.querySelectorAll('#map-style-label').forEach((lbl) => {
    lbl.innerText = s.name;
  });
  toast(`🗺️ ${s.name}`);
}

export function recenterMap() {
  if (!map) return;
  if (ST.pickup) {
    map.flyTo([ST.pickup.lat, ST.pickup.lng], 15, { animate: true, duration: 1 });
    toast('📍 ໂຟກັສຈຸດຮັບ');
    return;
  }
  if (fleet.size) {
    fitOnlineDrivers({ silent: true });
    return;
  }
  map.flyTo(VIENTIANE, 14, { duration: 0.6 });
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
