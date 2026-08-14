/** Emergency SOS with real GPS */
import { toast, closeModal } from './ui.js';
import { ST } from './state.js';

export function callPolice() {
  closeModal('sos-modal');
  toast('🚨 ກຳລັງໂທ 1191 ຕຳຫຼວດ...');
  setTimeout(() => toast('📞 ເຊື່ອມຕໍ່ສູນສຸກເສີນແລ້ວ (ຈຳລອງ)'), 1200);
}

export function shareLiveLocation() {
  closeModal('sos-modal');
  const fallback = ST.pickup || { lat: 17.9637, lng: 102.6133 };
  const send = (lat, lng) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => toast('📍 ຄັດລອກ Live Location ແລ້ວ'),
        () => toast(`📍 ${url}`)
      );
    } else {
      toast(`📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
    window.open(url, '_blank');
  };

  if (!navigator.geolocation) {
    send(fallback.lat, fallback.lng);
    return;
  }
  toast('📡 ກຳລັງດຶງ GPS...');
  navigator.geolocation.getCurrentPosition(
    (pos) => send(pos.coords.latitude, pos.coords.longitude),
    () => send(fallback.lat, fallback.lng),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}
