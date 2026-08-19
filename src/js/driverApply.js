/** Driver apply / KYC registration flow */
import { loadDB, patchDB } from './persist.js';
import { toast } from './ui.js';
import { ST } from './state.js';
import { isLive, currentUser } from './live/session.js';
import { getLiveState } from './live/client.js';
import { submitDriverApplication, uploadKycDoc, kycDocUrl } from './live/market.js';
import {
  KYC_GROUPS,
  compressImage,
  isSlotRequired,
  kycProgress
} from './kyc.js';

let step = 0;
const TOTAL = 4;
const localDocs = {};

export function getDriverApply() {
  if (isLive() && getLiveState().driver) {
    const d = getLiveState().driver;
    return {
      ...d,
      brand: d.brand || d.car,
      status: d.status,
      docs: d.docs || {}
    };
  }
  return loadDB().driverApply || null;
}

export function isDriverApproved() {
  if (isLive()) return getLiveState().driver?.status === 'approved';
  const a = getDriverApply();
  return a?.status === 'approved';
}

export function openDriverApply() {
  const a = getDriverApply();
  if (a?.status === 'approved' || a?.status === 'pending') step = 4;
  else if (a?.status === 'rejected') step = 3;
  else step = 0;
  window.openScreen?.('driver-apply');
  renderDriverApplyStep();
  fillDriverApplyForm();
}

export function driverApplyEditDocs() {
  step = 3;
  renderDriverApplyStep();
}

export async function driverApplyNext() {
  if (step === 1 && !validatePersonal()) return;
  if (step === 2 && !validateVehicle()) return;
  if (step === 3) {
    await submitDriverApply();
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

function idType() {
  return document.getElementById('da-id-type')?.value === 'passport' ? 'passport' : 'idcard';
}

function currentDocs() {
  const live = isLive() ? getLiveState().driver?.docs || {} : {};
  const saved = loadDB().driverApply?.docs || {};
  return { ...saved, ...live, ...localDocs };
}

function validatePersonal() {
  const name = document.getElementById('da-name')?.value.trim();
  const phone = document.getElementById('da-phone')?.value.trim();
  const city = document.getElementById('da-city')?.value.trim();
  const idNumber = document.getElementById('da-id')?.value.trim();
  const licenseNumber = document.getElementById('da-license-no')?.value.trim();
  if (!name || name.length < 2) {
    toast('⚠️ ກະລຸນາປ້ອນຊື່ຕາມບັດ');
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
  if (!idNumber || idNumber.length < 5) {
    toast('⚠️ ປ້ອນເລກບັດ ຫຼື ພາສປອດ');
    return false;
  }
  if (!licenseNumber || licenseNumber.length < 4) {
    toast('⚠️ ປ້ອນເລກໃບຂັບຂີ່');
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
    idType: idType(),
    idNumber: document.getElementById('da-id')?.value.trim() || '',
    licenseNumber: document.getElementById('da-license-no')?.value.trim() || '',
    vehicleType: document.getElementById('da-type')?.value || 'ride',
    brand: document.getElementById('da-brand')?.value.trim() || '',
    model: document.getElementById('da-model')?.value.trim() || '',
    color: document.getElementById('da-color')?.value.trim() || '',
    plate: document.getElementById('da-plate')?.value.trim() || '',
    year: document.getElementById('da-year')?.value.trim() || ''
  };
}

export async function onKycFile(slot, input) {
  const file = input?.files?.[0];
  input.value = '';
  if (!file) return;
  const tile = document.querySelector(`[data-kyc-slot="${slot}"]`);
  tile?.classList.add('is-busy');
  try {
    const image = await compressImage(file);
    localDocs[slot] = image;
    if (isLive()) {
      await uploadKycDoc(slot, image);
    }
    renderKycGrid();
    toast('✅ ອັບຮູບແລ້ວ');
  } catch (err) {
    toast(`❌ ${err.message || 'ອັບບໍ່ສຳເລັດ'}`);
  } finally {
    tile?.classList.remove('is-busy');
  }
}

export async function submitDriverApply() {
  const progress = kycProgress(currentDocs(), idType());
  if (!progress.complete) {
    toast(`⚠️ ອັບເອກະສານຄົບກ່ອນ (${progress.have}/${progress.need})`);
    return;
  }

  const data = collectForm();
  if (isLive()) {
    try {
      const driver = await submitDriverApplication(data);
      persistApply({ ...data, status: driver.status, docs: driver.docs || currentDocs() });
      step = 4;
      renderDriverApplyStep();
      toast(
        driver.status === 'approved'
          ? '✅ ອະນຸມັດແລ້ວ'
          : '📋 ສົ່ງຄຳຂໍແລ້ວ — ລໍຖ້າແອັດມິນກວດເອກະສານ'
      );
      window.refreshChrome?.();
    } catch (err) {
      toast(`❌ ${err.message}`);
    }
    return;
  }

  persistApply({
    ...data,
    docs: { ...currentDocs() },
    status: 'approved',
    submittedAt: Date.now(),
    approvedAt: Date.now()
  });
  step = 4;
  renderDriverApplyStep();
  toast('✅ ໂໝດເດໂມອະນຸມັດອັດຕະໂນມັດ — ໂໝດສົດຕ້ອງລໍຖ້າແອັດມິນ');
  window.refreshChrome?.();
}

function persistApply(payload) {
  const slimDocs = {};
  Object.entries(payload.docs || {}).forEach(([k, v]) => {
    slimDocs[k] = typeof v === 'string' ? { at: Date.now(), local: true } : v;
  });
  try {
    patchDB((d) => {
      d.driverApply = { ...payload, docs: slimDocs };
      if (d.user) {
        d.user.name = payload.name || d.user.name;
        d.user.phone = payload.phone || d.user.phone;
      }
    });
  } catch {
    patchDB((d) => {
      d.driverApply = { ...payload, docs: slimDocs };
    });
  }
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
  const a = getDriverApply() || {};
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null && v !== '') el.value = v;
  };
  set('da-name', a.name || u.name || '');
  set('da-phone', a.phone || u.phone || '');
  set('da-city', a.city || 'ວຽງຈັນ');
  set('da-id-type', a.idType || 'idcard');
  set('da-id', a.idNumber || '');
  set('da-license-no', a.licenseNumber || '');
  set('da-type', a.vehicleType || 'ride');
  set('da-brand', a.brand || '');
  set('da-model', a.model || '');
  set('da-color', a.color || '');
  set('da-plate', a.plate || '');
  set('da-year', a.year || '');

  document.querySelectorAll('input[name="da-type-radio"]').forEach((r) => {
    r.checked = r.value === (a.vehicleType || 'ride');
  });
}

function previewSrc(slot, docs) {
  const val = docs[slot] || localDocs[slot];
  if (typeof val === 'string' && val.startsWith('data:')) return val;
  if (typeof localDocs[slot] === 'string') return localDocs[slot];
  const userId = currentUser()?.id || getLiveState().driver?.userId;
  if (isLive() && userId && val) return `${kycDocUrl(userId, slot)}&t=${val.at || Date.now()}`;
  return '';
}

function renderKycGrid() {
  const root = document.getElementById('da-kyc-list');
  const count = document.getElementById('da-kyc-count');
  if (!root) return;
  const docs = currentDocs();
  const type = idType();
  const progress = kycProgress(docs, type);
  if (count) count.textContent = `${progress.have}/${progress.need} ຈຳເປັນ`;

  root.innerHTML = KYC_GROUPS.map((group) => {
    const tiles = group.slots
      .map((slot) => {
        const req = isSlotRequired(slot, type);
        const src = previewSrc(slot.id, docs);
        const capture = slot.selfie ? 'user' : 'environment';
        return `<article class="kyc-tile ${src ? 'has-file' : ''} ${req ? 'is-req' : ''}" data-kyc-slot="${slot.id}">
          <div class="kyc-preview">${
            src
              ? `<img src="${src}" alt="">`
              : `<i class="fa-solid ${slot.icon}"></i>`
          }</div>
          <div class="kyc-meta">
            <p>${slot.title} ${req ? '<em>ຈຳເປັນ</em>' : '<span>ທາງເລືອກ</span>'}</p>
            <small>${slot.hint}</small>
          </div>
          <div class="kyc-actions">
            <label class="kyc-btn">
              <i class="fa-solid fa-camera"></i> ຖ່າຍ
              <input type="file" accept="image/*" capture="${capture}" onchange="onKycFile('${slot.id}', this)">
            </label>
            <label class="kyc-btn ghost">
              ເລືອກ
              <input type="file" accept="image/*" onchange="onKycFile('${slot.id}', this)">
            </label>
          </div>
        </article>`;
      })
      .join('');
    return `<section class="kyc-group">
      <h3>${group.title}</h3>
      <p>${group.hint}</p>
      <div class="kyc-tiles">${tiles}</div>
    </section>`;
  }).join('');
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
    const titles = ['', 'ຂໍ້ມູນສ່ວນຕົວ', 'ຂໍ້ມູນລົດ', 'ເອກະສານ KYC', 'ສຳເລັດ'];
    label.textContent = step === 0 ? '' : `${step}/3 · ${titles[step] || ''}`;
  }

  if (nextBtn) {
    if (step === 0) nextBtn.textContent = 'ເລີ່ມສະໝັກ';
    else if (step === 3) nextBtn.textContent = 'ສົ່ງຄຳຂໍ';
    else nextBtn.textContent = 'ຕໍ່ໄປ';
  }
  if (backBtn) backBtn.textContent = step === 0 ? 'ປິດ' : 'ກັບ';

  if (step === 3) renderKycGrid();

  const a = getDriverApply();
  const statusEl = document.getElementById('da-status-text');
  const carEl = document.getElementById('da-done-car');
  const driveBtn = document.getElementById('da-start-drive');
  if (statusEl) {
    if (a?.status === 'approved') statusEl.textContent = 'ບັນຊີຄົນຂັບຖືກອະນຸມັດແລ້ວ';
    else if (a?.status === 'rejected') statusEl.textContent = a.rejectReason
      ? `ປະຕິເສດ: ${a.rejectReason}`
      : 'ຄຳຂໍຖືກປະຕິເສດ — ແກ້ເອກະສານແລ້ວສົ່ງໃໝ່';
    else statusEl.textContent = 'ລໍຖ້າແອັດມິນກວດເອກະສານ';
  }
  if (carEl && a) {
    carEl.textContent = [a.brand, a.model, a.plate].filter(Boolean).join(' · ') || '—';
  }
  if (driveBtn) driveBtn.classList.toggle('hidden', a?.status !== 'approved');
}

export function syncDriverApplyEntry() {
  const a = getDriverApply();
  const entryLabel = document.getElementById('driver-apply-entry-label');
  const badge = document.getElementById('driver-apply-badge');
  if (entryLabel) {
    entryLabel.textContent =
      a?.status === 'approved'
        ? 'ໂປຣໄຟລ໌ຄົນຂັບ'
        : a?.status === 'pending'
          ? 'ສະຖານະການສະໝັກ'
          : a?.status === 'rejected'
            ? 'ແກ້ເອກະສານ KYC'
            : 'ສະໝັກຂັບລົດກັບ iDrive';
  }
  if (badge) {
    if (a?.status === 'approved') {
      badge.textContent = 'ອະນຸມັດແລ້ວ';
      badge.className = 'text-[10px] font-bold text-idrive-green';
    } else if (a?.status === 'pending') {
      badge.textContent = 'ລໍຖ້າ KYC';
      badge.className = 'text-[10px] font-bold text-yellow-400';
    } else if (a?.status === 'rejected') {
      badge.textContent = 'ປະຕິເສດ';
      badge.className = 'text-[10px] font-bold text-red-400';
    } else {
      badge.textContent = 'ໃໝ່';
      badge.className = 'text-[10px] font-bold text-idrive-green';
    }
  }
  document.getElementById('driver-apply-entry')?.classList.remove('hidden');
}
