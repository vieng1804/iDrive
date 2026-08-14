/** Trip history from localStorage */
import { loadDB } from './persist.js';

export function renderHistory() {
  const box = document.getElementById('history-list');
  if (!box) return;
  const { history } = loadDB();
  if (!history.length) {
    box.innerHTML =
      '<p class="text-center text-gray-500 py-8 text-xs">ຍັງບໍ່ມີປະຫວັດ — ຈົບທ່ຽວທຳອິດເພື່ອເລີ່ມ</p>';
    return;
  }
  box.innerHTML = history
    .map((h) => {
      const d = new Date(h.at);
      const date = d.toLocaleString('lo-LA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `<div class="bg-idrive-dark p-3.5 rounded-2xl border border-idrive-border space-y-1.5 shadow">
        <div class="flex justify-between"><span class="text-gray-400 text-[10px]">${date}</span><span class="bg-green-500/20 text-green-400 text-[10px] px-2.5 py-0.5 rounded-full font-bold">ສຳເລັດ ★${h.rating || 5}</span></div>
        <p class="font-bold">${h.route}</p>
        <div class="flex justify-between text-gray-400 text-[11px] pt-1 border-t border-gray-800"><span>${h.driver}</span><span class="text-idrive-green font-black">${h.fare.toLocaleString()} ₭</span></div>
      </div>`;
    })
    .join('');
}

export function openHistory() {
  renderHistory();
}
