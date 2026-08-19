import { pingLocation, setDriverOnline } from './market.js';
import { isLive } from './session.js';

let watchId = null;

export function startDriverGps() {
  if (!isLive() || !navigator.geolocation) return;
  stopDriverGps();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      pingLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {});
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
  );
}

export function stopDriverGps() {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

export async function goOnlineWithGps() {
  const coords = await currentCoords();
  await setDriverOnline(true, coords);
  startDriverGps();
  return coords;
}

export async function goOfflineGps() {
  stopDriverGps();
  await setDriverOnline(false);
}

function currentCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}
