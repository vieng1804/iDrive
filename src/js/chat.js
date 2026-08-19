/** In-trip chat with contextual driver replies */
import { ST } from './state.js';
import { isLive, currentUser } from './live/session.js';
import { sendLiveChat, chatFor } from './live/market.js';
import { getActiveOrder } from './marketplace.js';
import { onLive } from './live/client.js';

let peerName = 'ຄົນຂັບ';

const REPLIES = [
  'ຮັບຊາບ! 🙏',
  'ໃກ້ຮອດແລ້ວ 2-3 ນາທີ 🚗',
  'ຂ້ອຍເຫັນທ່ານແລ້ວ',
  'ລໍຖ້າໜ້າປະຕູນ້ອຍໜຶ່ງ',
  'OK! ຂອບໃຈ'
];

export function setChatPeer(name) {
  peerName = name || 'ຄົນຂັບ';
  const title = document.getElementById('chat-peer-name');
  if (title) title.innerText = `${peerName} (ຄົນຂັບ)`;
}

export function resetChat(intro) {
  const box = document.getElementById('chat-box');
  if (!box) return;
  if (isLive()) {
    renderLiveChat(intro);
    if (!window.__chatBound) {
      window.__chatBound = true;
      onLive(() => renderLiveChat());
    }
    return;
  }
  box.innerHTML = `<div class="bg-idrive-dark p-3 rounded-2xl max-w-[80%] text-gray-300 border border-idrive-border">${intro || 'ສະບາຍດີ! ກຳລັງໄປຮັບ. 🚗'}</div>`;
}

function renderLiveChat(intro) {
  const box = document.getElementById('chat-box');
  if (!box) return;
  const order = getActiveOrder();
  const msgs = order ? chatFor(order.id) : [];
  const me = currentUser()?.id;
  if (!msgs.length) {
    box.innerHTML = `<div class="bg-idrive-dark p-3 rounded-2xl max-w-[80%] text-gray-300 border border-idrive-border">${intro || 'ສະບາຍດີ! ກຳລັງໄປຮັບ. 🚗'}</div>`;
    return;
  }
  box.innerHTML = msgs
    .map((m) => {
      const mine = m.userId === me;
      return mine
        ? `<div class="bg-idrive-green text-gray-950 font-bold p-3 rounded-2xl max-w-[80%] ml-auto shadow fade-up">${m.text}</div>`
        : `<div class="bg-idrive-dark p-3 rounded-2xl max-w-[80%] text-gray-300 border border-idrive-border fade-up">${m.text}</div>`;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
}

export function quickChat(msg) {
  document.getElementById('chat-input').value = msg;
  sendChat();
}

export async function sendChat() {
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  const box = document.getElementById('chat-box');
  if (isLive()) {
    const order = getActiveOrder();
    if (!order) return;
    inp.value = '';
    try {
      await sendLiveChat(order.id, msg);
    } catch (err) {
      box.innerHTML += `<div class="text-[10px] text-red-400">${err.message}</div>`;
    }
    return;
  }
  box.innerHTML += `<div class="bg-idrive-green text-gray-950 font-bold p-3 rounded-2xl max-w-[80%] ml-auto shadow fade-up">${msg}</div>`;
  inp.value = '';
  box.scrollTop = box.scrollHeight;

  setTimeout(() => {
    let reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    if (msg.includes('ໃກ້')) reply = 'ໃກ້ຮອດແລ້ວ! ປະມານ 2 ນາທີ ⏱️';
    if (msg.includes('ຖ້າ') || msg.includes('ຕໍ່ໜ້າ'))
      reply = 'OK ຂ້ອຍຈະມາຫາທ່ານຢູ່ຕໍ່ໜ້າ';
    if (msg.includes('ລົງ')) reply = 'ຮັບຮູ້ — ກຳລັງມາ';
    box.innerHTML += `<div class="bg-idrive-dark p-3 rounded-2xl max-w-[80%] text-gray-300 border border-idrive-border fade-up">${reply}</div>`;
    box.scrollTop = box.scrollHeight;
  }, 700 + Math.random() * 800);
}

export function startCall() {
  const modal = document.getElementById('call-modal');
  const name = document.getElementById('trip-driver-name')?.innerText || peerName;
  document.getElementById('call-name').innerText = name;
  document.getElementById('call-status').innerText = 'ກຳລັງໂທ...';
  modal.classList.remove('hidden');

  let sec = 0;
  clearInterval(ST.callTimer);
  ST.callTimer = setInterval(() => {
    sec += 1;
    if (sec === 2) document.getElementById('call-status').innerText = 'ສາຍເຊື່ອມຕໍ່ແລ້ວ';
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    document.getElementById('call-timer').innerText = `${m}:${s}`;
  }, 1000);
}

export function endCall() {
  clearInterval(ST.callTimer);
  document.getElementById('call-modal').classList.add('hidden');
  document.getElementById('call-timer').innerText = '00:00';
}
