/** Driver apply / registration flow */
import { loadDB, patchDB } from './persist.js';
import { toast } from './ui.js';
import { ST } from './state.js';

let step = 0; // 0 intro, 1 personal, 2 vehicle, 3 docs, 4 done
const TOTAL = 4;

export function getDriverApply() {
  return loadDB().driverApply || null;
}

export function isDriverApproved() {
  const a = getDriverApply();
  return a?.status === 'approved';
}

export function openDriverApply() {
  const a = getDriverApply();
  step = a?.status === 'approved' || a?.status === 'pending' ? 4 : 0;
  window.openScreen?.('driver-apply');
  renderDriverApplyStep();
  fillDriverApplyForm();
}

export function driverApplyNext() {
  if (step === 1 && !validatePersonal()) return;
  if (step === 2 && !validateVehicle()) return;
  if (step === 3) {
    submitDriverApply();
    return;
  }
  if (step < TOTAL) {
    step += 1;
    renderDriverApplyStep();
  }
}

export function driverApplyBack() {
  if (step <= 0) {
    window.closeScreen?.('driver-apply');
    return;
  }
  if (step === 4) {
    window.closeScreen?.('driver-apply');
    return;
  }
  step -= 1;
  renderDriverApplyStep();
}

function validatePersonal() {
  const name = document.getElementById('da-name')?.value.trim();
  const phone = document.getElementById('da-phone')?.value.trim();
  const city = document.getElementById('da-city')?.value.trim();
  if (!name || name.length < 2) {
    toast('⚠️ ກະລຸນາປ້ອນຊື່');
    return false;
  }
  if (!phone || phone.replace(/\D/g, '').length < 8) {
    toast('⚠️ ກະລຸນາປ້ອນເບີໂທໃຫ້ຖືກ');
    return false;
  }
  if (!city) {
    toast('⚠️ ກະລຸນາເລືອກເມືອງ');
    return false;
  }
  return true;
}

function validateVehicle() {
  const brand = document.getElementById('da-brand')?.value.trim();
  const model = document.getElementById('da-model')?.value.trim();
  const plate = document.getElementById('da-plate')?.value.trim();
  const type = document.getElementById('da-type')?.value;
  if (!type) {
    toast('⚠️ ເລືອກປະເພດລົດ');
    return false;
  }
  if (!brand || !model) {
    toast('⚠️ ປ້ອນຍີ່ຫໍ້ ແລະ ລຸ້ນລົດ');
    return false;
  }
  if (!plate) {
    toast('⚠️ ປ້ອນເລກທະບຽນ');
    return false;
  }
  return true;
}

function collectForm() {
  return {
    name: document.getElementById('da-name')?.value.trim() || '',
    phone: document.getElementById('da-phone')?.value.trim() || '',
    city: document.getElementById('da-city')?.value || '',
    idNumber: document.getElementById('da-id')?.value.trim() || '',
    vehicleType: document.getElementById('da-type')?.value || 'ride',
    brand: document.getElementById('da-brand')?.value.trim() || '',
    model: document.getElementById('da-model')?.value.trim() || '',
    color: document.getElementById('da-color')?.value.trim() || '',
    plate: document.getElementById('da-plate')?.value.trim() || '',
    year: document.getElementById('da-year')?.value.trim() || '',
    licenseOk: document.getElementById('da-doc-license')?.checked || false,
    regOk: document.getElementById('da-doc-reg')?.checked || false,
    photoOk: document.getElementById('da-doc-photo')?.checked || false
  };
}

export function submitDriverApply() {
  const licenseOk = document.getElementById('da-doc-license')?.checked;
  const regOk = document.getElementById('da-doc-reg')?.checked;
  if (!licenseOk || !regOk) {
    toast('⚠️ ຕ້ອງຢືນຢັນໃບຂັບຂີ່ ແລະ ທະບຽນລົດ');
    return;
  }

  const data = collectForm();
  const application = {
    ...data,
    status: 'approved', // demo: auto-approve
    submittedAt: Date.now(),
    approvedAt: Date.now()
  };

  patchDB((d) => {
    d.driverApply = application;
    d.notifications = [
      {
        id: `n_${Date.now()}`,
        title: 'ສະໝັກຂັບລົດສຳເລັດ',
        body: 'ບັນຊີຄົນຂັບຖືກອະນຸມັດແລ້ວ — ເລີ່ມຮັບງານໄດ້ເລີຍ',
        read: false,
        at: Date.now()
      },
      ...(d.notifications || [])
    ];
    if (d.user) {
      d.user.name = data.name || d.user.name;
      d.user.phone = data.phone || d.user.phone;
    }
  });

  step = 4;
  renderDriverApplyStep();
  toast('✅ ສະໝັກຂັບລົດສຳເລັດ — ອະນຸມັດແລ້ວ');
  window.refreshChrome?.();
}

export function startDriveAfterApply() {
  window.closeScreen?.('driver-apply');
  if (ST.role !== 'driver') {
    window.switchRole?.();
  } else {
    window.goTab?.('home');
  }
}

export function fillDriverApplyForm() {
  const db = loadDB();
  const u = db.user || {};
  const a = db.driverApply || {};
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null && v !== '') el.value = v;
  };
  set('da-name', a.name || u.name || '');
  set('da-phone', a.phone || u.phone || '');
  set('da-city', a.city || 'ວຽງຈັນ');
  set('da-id', a.idNumber || '');
  set('da-type', a.vehicleType || 'ride');
  set('da-brand', a.brand || '');
  set('da-model', a.model || '');
  set('da-color', a.color || '');
  set('da-plate', a.plate || '');
  set('da-year', a.year || '');
  if (a.licenseOk) document.getElementById('da-doc-license').checked = true;
  if (a.regOk) document.getElementById('da-doc-reg').checked = true;
  if (a.photoOk) document.getElementById('da-doc-photo').checked = true;

  document.querySelectorAll('input[name="da-type-radio"]').forEach((r) => {
    r.checked = r.value === (a.vehicleType || 'ride');
  });
}

export function renderDriverApplyStep() {
  const steps = ['da-step-intro', 'da-step-personal', 'da-step-vehicle', 'da-step-docs', 'da-step-done'];
  steps.forEach((id, i) => {
    document.getElementById(id)?.classList.toggle('hidden', i !== step);
  });

  const prog = document.getElementById('da-progress');
  const bar = document.getElementById('da-progress-bar');
  const label = document.getElementById('da-step-label');
  const nextBtn = document.getElementById('da-next-btn');
  const backBtn = document.getElementById('da-back-btn');
  const footer = document.getElementById('da-footer');

  if (step === 0 || step === 4) {
    prog?.classList.add('hidden');
    footer?.classList.toggle('hidden', step === 4);
  } else {
    prog?.classList.remove('hidden');
    footer?.classList.remove('hidden');
  }

  const pct = step === 0 ? 0 : step === 4 ? 100 : Math.round((step / 3) * 100);
  if (bar) bar.style.width = `${pct}%`;
  if (label) {
    const titles = ['', 'ຂໍ້ມູນສ່ວນຕົວ', 'ຂໍ້ມູນລົດ', 'ເອກະສານ', 'ສຳເລັດ'];
    label.textContent = step === 0 ? '' : `${step}/3 · ${titles[step] || ''}`;
  }

  if (nextBtn) {
    if (step === 0) nextBtn.textContent = 'ເລີ່ມສະໝັກ';
    else if (step === 3) nextBtn.textContent = 'ສົ່ງຄຳຂໍ';
    else nextBtn.textContent = 'ຕໍ່ໄປ';
  }
  if (backBtn) {
    backBtn.textContent = step === 0 ? 'ປິດ' : 'ກັບ';
  }

  // Done status card
  const a = getDriverApply();
  const statusEl = document.getElementById('da-status-text');
  const carEl = document.getElementById('da-done-car');
  if (statusEl) {
    statusEl.textContent =
      a?.status === 'approved'
        ? 'ບັນຊີຄົນຂັບຖືກອະນຸມັດແລ້ວ'
        : 'ລໍຖ້າການກວດສອບ';
  }
  if (carEl && a) {
    carEl.textContent = [a.brand, a.model, a.plate].filter(Boolean).join(' · ') || '—';
  }
}

export function syncDriverApplyEntry() {
  const a = getDriverApply();
  const entry = document.getElementById('driver-apply-entry');
  const entryLabel = document.getElementById('driver-apply-entry-label');
  const badge = document.getElementById('driver-apply-badge');
  if (entryLabel) {
    entryLabel.textContent =
      a?.status === 'approved'
        ? 'ໂປຣໄຟລ໌ຄົນຂັບ'
        : a?.status === 'pending'
          ? 'ສະຖານະການສະໝັກ'
          : 'ສະໝັກຂັບລົດກັບ iDrive';
  }
  if (badge) {
    if (a?.status === 'approved') {
      badge.textContent = 'ອະນຸມັດແລ້ວ';
      badge.className = 'text-[10px] font-bold text-idrive-green';
    } else if (a?.status === 'pending') {
      badge.textContent = 'ລໍຖ້າ';
      badge.className = 'text-[10px] font-bold text-yellow-400';
    } else {
      badge.textContent = 'ໃໝ່';
      badge.className = 'text-[10px] font-bold text-idrive-green';
    }
  }
  entry?.classList.remove('hidden');
}
