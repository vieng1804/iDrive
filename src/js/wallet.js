/** Wallet & BCEL One — real balance from localStorage */
import { ST } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { loadDB, patchDB } from './persist.js';

export function refreshWalletUI(db = loadDB()) {
  const el = document.getElementById('wallet-balance');
  if (el) el.innerText = `${db.wallet.toLocaleString()} LAK`;
}

export function setPayment(key, label, icon, color) {
  ST.payment = label;
  ST.paymentKey = key;
  document.getElementById('pay-label').innerText =
    key === 'cash' ? 'ເງິນສົດ' : key === 'wallet' ? 'Wallet' : 'BCEL One';
  document.getElementById('pay-icon').className =
    `fa-solid ${icon} ${color} text-sm`;
  closeModal('wallet-modal');
  toast(`💳 ${label}`);
}

export function showQR() {
  document.getElementById('qr-amount').innerText =
    `${ST.fare.toLocaleString()} LAK`;
  closeModal('wallet-modal');
  openModal('bcel-modal');
}

export function confirmQR() {
  ST.payment = 'BCEL One';
  ST.paymentKey = 'bcel';
  document.getElementById('pay-label').innerText = 'BCEL One';
  document.getElementById('pay-icon').className =
    'fa-solid fa-qrcode text-red-500 text-sm';
  closeModal('bcel-modal');
  toast('✅ ເລືອກ BCEL One ແລ້ວ — ຈະຫັກເມື່ອທ່ຽວສຳເລັດ');
}

export function topUpWallet(amount = 50000) {
  const db = patchDB((d) => {
    d.wallet += amount;
  });
  refreshWalletUI(db);
  toast(`➕ ເຕີມ ${amount.toLocaleString()} ₭ ສຳເລັດ`);
}
