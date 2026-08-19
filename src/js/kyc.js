/** Shared KYC document slots for driver apply + admin review. */

export const KYC_GROUPS = [
  {
    id: 'identity',
    title: 'ບັດປະຈຳຕົວ / ພາສປອດ',
    hint: 'ຮູບຊັດ ອ່ານໄດ້ທຸກຕົວອັກສອນ — ບໍ່ຕັດມຸມ',
    slots: [
      {
        id: 'id_front',
        title: 'ດ້ານໜ້າ',
        hint: 'ບັດປະຈຳຕົວ ຫຼື ໜ້າພາສປອດ',
        required: true,
        icon: 'fa-id-card'
      },
      {
        id: 'id_back',
        title: 'ດ້ານຫຼັງ',
        hint: 'ບັດປະຈຳຕົວ (ພາສປອດຂ້າມໄດ້)',
        requiredIf: 'idcard',
        icon: 'fa-id-card'
      },
      {
        id: 'selfie_id',
        title: 'ຖືບັດຄູ່ໃບໜ້າ',
        hint: 'ເຫັນໃບໜ້າ ແລະ ເອກະສານຊັດ',
        required: true,
        icon: 'fa-user',
        selfie: true
      }
    ]
  },
  {
    id: 'license',
    title: 'ໃບຂັບຂີ່',
    hint: 'ຍັງບໍ່ໝົດອາຍຸ ແລະ ຊື່ກົງກັບບັດ',
    slots: [
      {
        id: 'license_front',
        title: 'ໃບຂັບຂີ່ ດ້ານໜ້າ',
        hint: 'ເຫັນເລກໃບຂັບ ແລະ ຮູບ',
        required: true,
        icon: 'fa-id-badge'
      },
      {
        id: 'license_back',
        title: 'ໃບຂັບຂີ່ ດ້ານຫຼັງ',
        hint: 'ປະເພດລົດທີ່ອະນຸຍາດ',
        required: true,
        icon: 'fa-id-badge'
      }
    ]
  },
  {
    id: 'vehicle_docs',
    title: 'ເອກະສານລົດ',
    hint: 'ປຶ້ມສີຂຽວ / ທະບຽນ ຊື່ກົງກັບເຈົ້າຂອງ',
    slots: [
      {
        id: 'vehicle_reg',
        title: 'ເອກະສານລົດ',
        hint: 'ປຶ້ມສີຂຽວ ຫຼື ໃບທະບຽນ',
        required: true,
        icon: 'fa-file-lines'
      },
      {
        id: 'selfie_reg',
        title: 'ຖືເອກະສານລົດ',
        hint: 'ຖືຮູບຄູ່ກັບເອກະສານລົດ',
        required: true,
        icon: 'fa-hand',
        selfie: true
      }
    ]
  },
  {
    id: 'vehicle_photos',
    title: 'ຮູບລົດ',
    hint: 'ຖ່າຍທັງຄັນ ໃສ່ແສງພຽງພໍ ເຫັນເລກທະບຽນ',
    slots: [
      {
        id: 'car_front',
        title: 'ດ້ານໜ້າ',
        hint: 'ເຫັນໜ້າລົດ ແລະ ທະບຽນ',
        required: true,
        icon: 'fa-car'
      },
      {
        id: 'car_back',
        title: 'ດ້ານຫຼັງ',
        hint: 'ເຫັນທະບຽນຫຼັງ',
        required: true,
        icon: 'fa-car'
      },
      {
        id: 'car_side',
        title: 'ດ້ານຂ້າງ',
        hint: 'ຖ່າຍທັງຄັນ',
        required: true,
        icon: 'fa-car-side'
      },
      {
        id: 'car_interior',
        title: 'ພາຍໃນ',
        hint: 'ບ່ອນນັ່ງຜູ້ໂດຍສານ',
        required: false,
        icon: 'fa-couch'
      },
      {
        id: 'selfie_car',
        title: 'ຄູ່ກັບລົດ',
        hint: 'ຢືນຄູ່ລົດ ເຫັນໃບໜ້າ ແລະ ລົດ',
        required: true,
        icon: 'fa-camera',
        selfie: true
      }
    ]
  },
  {
    id: 'extra',
    title: 'ເອກະສານເພີ່ມ',
    hint: 'ປະກັນໄພ ຫຼື ເອກະສານອື່ນທີ່ຈຳເປັນ',
    slots: [
      {
        id: 'insurance',
        title: 'ປະກັນໄພລົດ',
        hint: 'ຖ້າມີ',
        required: false,
        icon: 'fa-shield-halved'
      },
      {
        id: 'other',
        title: 'ອື່ນໆ',
        hint: 'ໃບມອບອຳນາດ / ເອກະສານເພີ່ມ',
        required: false,
        icon: 'fa-folder-open'
      }
    ]
  }
];

export const KYC_SLOTS = KYC_GROUPS.flatMap((g) => g.slots);

export function isSlotRequired(slot, idType = 'idcard') {
  if (slot.required) return true;
  if (slot.requiredIf && slot.requiredIf === idType) return true;
  return false;
}

export function requiredSlots(idType = 'idcard') {
  return KYC_SLOTS.filter((s) => isSlotRequired(s, idType));
}

export function kycProgress(docs = {}, idType = 'idcard') {
  const need = requiredSlots(idType);
  const have = need.filter((s) => docs[s.id]);
  return {
    have: have.length,
    need: need.length,
    missing: need.filter((s) => !docs[s.id]).map((s) => s.id),
    complete: have.length === need.length
  };
}

export function compressImage(file, { max = 1280, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('ເລືອກຮູບເທົ່ານັ້ນ'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ອ່ານຮູບບໍ່ໄດ້'));
    };
    img.src = url;
  });
}
