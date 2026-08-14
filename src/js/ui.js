/** Shared UI helpers: toast, modals, sidebar, show/hide */

let toastTimer;

export function show(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  if (visible) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

export function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (open) sidebar.classList.remove('-translate-x-full');
  else sidebar.classList.add('-translate-x-full');
}

export function openModal(id) {
  show(id, true);
  if (id === 'history-modal' && window.openHistoryModal) {
    /* history filled by openHistoryModal */
  }
}

export function closeModal(id) {
  show(id, false);
}

export function toast(msg) {
  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!el || !msgEl) return;
  msgEl.innerText = msg;
  el.classList.remove('-translate-y-24', 'opacity-0');
  el.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('-translate-y-24', 'opacity-0');
    el.classList.remove('translate-y-0', 'opacity-100');
  }, 3000);
}
