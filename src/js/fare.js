/**
 * Recommended bidding fare (inDrive-style, Laos).
 *
 * inDrive does not publish a live public pricing API. Their help docs say the
 * app shows a recommended *minimum bid* from pickup + destination; passengers
 * may offer that or more; airport/tolls are extra. This engine follows that
 * model. City rates are calibrated to current Laos app prices: a ~7 km /
 * 11 min sedan ride recommends about 85,000 ₭ (market band 75,000–120,000 ₭).
 */
import { ST } from './state.js';

const WATTAY = { lat: 17.9883, lng: 102.563, name: 'ວັດໄຕ' };

export const FARE_TABLE = {
  ride: {
    min: 28000,
    perKm: 7000,
    perMin: 700,
    intercityBase: 120000,
    intercityPerKm: 2500
  },
  moto: {
    min: 18000,
    perKm: 4200,
    perMin: 400,
    intercityBase: 70000,
    intercityPerKm: 1400
  },
  comfort: {
    min: 38000,
    perKm: 8200,
    perMin: 800,
    intercityBase: 160000,
    intercityPerKm: 3000
  },
  suv: {
    min: 45000,
    perKm: 9200,
    perMin: 900,
    intercityBase: 190000,
    intercityPerKm: 3400
  }
};

export const BASE_FARE = Object.fromEntries(
  Object.entries(FARE_TABLE).map(([k, v]) => [k, v.min])
);

export const FARE_PER_KM = Object.fromEntries(
  Object.entries(FARE_TABLE).map(([k, v]) => [k, v.perKm])
);

function roundK(n) {
  return Math.max(5000, Math.ceil(n / 1000) * 1000);
}

function hourLocal(at) {
  return at.getHours() + at.getMinutes() / 60;
}

function peakFactor(at) {
  const h = hourLocal(at);
  if ((h >= 7 && h < 9) || (h >= 16.5 && h < 19.5)) return 1.15;
  return 1;
}

function nightFactor(at) {
  const h = hourLocal(at);
  if (h >= 22 || h < 5) return 1.2;
  return 1;
}

function nearAirport(pt) {
  if (!pt || pt.lat == null) return false;
  const name = String(pt.name || '');
  if (/ວັດໄຕ|wattay|airport|ສະໜາມບິນ/i.test(name)) return true;
  const dlat = pt.lat - WATTAY.lat;
  const dlng = pt.lng - WATTAY.lng;
  return Math.sqrt(dlat * dlat + dlng * dlng) < 0.018;
}

export function recommendFare({
  vehicle = ST.vehicle || 'ride',
  km = Number(ST.routeDistance) || 0,
  minutes = Number(ST.routeTime) || 0,
  service = ST.service || 'city',
  pickup = ST.pickup,
  dest = ST.dest,
  at = new Date()
} = {}) {
  const spec = FARE_TABLE[vehicle] || FARE_TABLE.ride;
  const longHaul = service === 'intercity' || km >= 60;
  let raw = longHaul
    ? spec.intercityBase + km * spec.intercityPerKm + minutes * spec.perMin * 0.25
    : spec.min + km * spec.perKm + minutes * spec.perMin;

  const peak = peakFactor(at);
  const night = nightFactor(at);
  raw *= peak * night;

  const amount = roundK(Math.max(spec.min, raw));
  const airport = nearAirport(pickup) || nearAirport(dest);

  return {
    amount,
    min: spec.min,
    peak: peak > 1,
    night: night > 1,
    airport,
    longHaul,
    label: `ແນະນຳຂັ້ນຕ່ຳ: ${amount.toLocaleString()} ₭`
  };
}

export function applyRecommendedFare(rec = recommendFare()) {
  ST.fare = rec.amount;
  const fareInput = document.getElementById('fare-input');
  if (fareInput) fareInput.value = rec.amount;
  const sug = document.getElementById('suggested-label');
  if (sug) sug.innerText = rec.label;
  const hint = document.getElementById('fare-hint');
  if (hint) {
    const bits = [];
    if (rec.peak) bits.push('ຊົ່ວໂມງຄາບ');
    if (rec.night) bits.push('ກາງຄືນ');
    if (rec.airport) bits.push('ຄ່າສະໜາມບິນຈ່າຍແຍກ');
    hint.textContent = bits.length
      ? bits.join(' · ')
      : 'ສະເໜີຕາມນີ້ ຫຼືສູງກວ່າ — ຄົນຂັບຮັບ ຫຼືຕໍ່ລາຄາໄດ້';
  }
  const badge = document.getElementById('route-fare-badge');
  if (badge)
    badge.innerHTML = `<i class="fa-solid fa-coins"></i> ${rec.amount.toLocaleString()} ₭`;
  const priceEl = document.getElementById(`price-${ST.vehicle}`);
  if (priceEl) priceEl.innerText = `${rec.amount.toLocaleString()} ₭`;
  return rec;
}
