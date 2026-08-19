/** KYC image files on disk — not stored inside idrive.json. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'data', 'kyc');

export const KYC_SLOT_IDS = [
  'id_front',
  'id_back',
  'selfie_id',
  'license_front',
  'license_back',
  'vehicle_reg',
  'selfie_reg',
  'car_front',
  'car_back',
  'car_side',
  'car_interior',
  'selfie_car',
  'insurance',
  'other'
];

export const KYC_REQUIRED = [
  'id_front',
  'selfie_id',
  'license_front',
  'license_back',
  'vehicle_reg',
  'selfie_reg',
  'car_front',
  'car_back',
  'car_side',
  'selfie_car'
];

function safeId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
}

export function isKycSlot(slot) {
  return KYC_SLOT_IDS.includes(slot);
}

export function requiredFor(idType = 'idcard') {
  const extra = idType === 'passport' ? [] : ['id_back'];
  return [...KYC_REQUIRED, ...extra];
}

export function docStatus(driver = {}) {
  const docs = driver.docs || {};
  const need = requiredFor(driver.idType || 'idcard');
  const missing = need.filter((id) => !docs[id]);
  return {
    have: need.length - missing.length,
    need: need.length,
    missing,
    complete: missing.length === 0
  };
}

export function saveKycFile(userId, slot, buf) {
  const uid = safeId(userId);
  const sid = safeId(slot);
  if (!uid || !isKycSlot(sid)) return null;
  const dir = join(ROOT, uid);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sid}.jpg`);
  writeFileSync(file, buf);
  return file;
}

export function readKycFile(userId, slot) {
  const uid = safeId(userId);
  const sid = safeId(slot);
  const file = join(ROOT, uid, `${sid}.jpg`);
  if (!existsSync(file)) return null;
  return { buf: readFileSync(file), mime: 'image/jpeg' };
}

export function parseImageDataUrl(raw) {
  const m = String(raw || '').match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > 2_000_000) return null;
  return buf;
}
