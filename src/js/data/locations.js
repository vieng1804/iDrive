/** Vientiane landmarks, service presets, drivers & job feed */

export const VIENTIANE = [17.9637, 102.6133];
export const PATUXAY = [17.9708, 102.6178];

export const LANDMARKS = [
  { display_name: 'ຕະຫຼາດເຊົ້າ ມໍ, ວຽງຈັນ', lat: '17.9637', lon: '102.6133' },
  { display_name: 'ປະຕູໄຊ (Patuxay), ວຽງຈັນ', lat: '17.9708', lon: '102.6178' },
  { display_name: 'ດົງໂດກ ມ.ສ.ລ, ວຽງຈັນ', lat: '18.0200', lon: '102.6450' },
  { display_name: 'ສະໜາມບິນ ວຽງຈັນ ວັດໄຕ', lat: '17.9883', lon: '102.5630' },
  { display_name: 'ITEC Mall, ສີໂຄດຕະບອງ', lat: '18.0050', lon: '102.6450' },
  { display_name: 'ໂຮງໝໍ ມິດຕະພາບ, ວຽງຈັນ', lat: '17.9800', lon: '102.6100' },
  { display_name: 'ຕະຫຼາດ ກາງ, ວຽງຈັນ', lat: '17.9660', lon: '102.6050' },
  { display_name: 'That Luang, ວຽງຈັນ', lat: '17.9750', lon: '102.6380' },
  { display_name: 'ທ່ານາລ, ວຽງຈັນ', lat: '18.0080', lon: '102.6120' },
  { display_name: 'ຫໍລໍ ທ່ວງ, ວຽງຈັນ', lat: '17.9600', lon: '102.6200' }
];

export const SERVICES = {
  city: {
    p: 'ຕະຫຼາດເຊົ້າ ມໍ, ວຽງຈັນ',
    d: 'ປະຕູໄຊ, ວຽງຈັນ',
    pLat: 17.9637,
    pLng: 102.6133,
    dLat: 17.9708,
    dLng: 102.6178
  },
  intercity: {
    p: 'ວຽງຈັນ (ສຖານີລົດໄຟ)',
    d: 'ຫຼວງພະບາງ (ສຖານີ)',
    pLat: 17.9882,
    pLng: 102.5625,
    dLat: 19.8844,
    dLng: 102.1347
  },
  freight: {
    p: 'ທ່ານາລ ດ່ານ, ວຽງຈັນ',
    d: 'ເຂດອຸດສາຫະກຳ ດົງໂດກ',
    pLat: 17.91,
    pLng: 102.65,
    dLat: 18.03,
    dLng: 102.635
  },
  courier: {
    p: 'Amazon Café, ໂພນໄຊ',
    d: 'ອາຄານ ບູຮານ, ສີຫອມ',
    pLat: 17.968,
    pLng: 102.615,
    dLat: 17.962,
    dLng: 102.605
  }
};

export const DRIVERS = [
  {
    id: 1,
    name: 'ທ່ານ ສົມໄຊ ທຳມະວົງ',
    car: 'Toyota Vios • ກຳ 8888',
    rating: '4.92',
    trips: '340+',
    eta: '2 ນທ',
    img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    mult: 1.0
  },
  {
    id: 2,
    name: 'ທ່ານ ບຸນມີ ວົງສະຫວັນ',
    car: 'Honda City • ກຂ 1234',
    rating: '4.88',
    trips: '210+',
    eta: '4 ນທ',
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    mult: 1.1
  },
  {
    id: 3,
    name: 'ທ່ານ ຄຳແພງ ໄຊຍະວົງ',
    car: 'Hyundai Elantra • ກຄ 9999',
    rating: '5.0',
    trips: '520+',
    eta: '5 ນທ',
    img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    mult: 0.85
  }
];

export const JOBS = [
  {
    id: 101,
    passenger: 'ທ່ານ ບຸນເກີດ',
    fare: 75000,
    counter: 85000,
    route: 'ຕະຫຼາດຊາວໄຮ່ ➔ ດົງໂດກ',
    dist: '5.2 ກມ • ເກັງ'
  },
  {
    id: 102,
    passenger: 'ທ່ານ ນາງ ມະລີ',
    fare: 33000,
    counter: 38000,
    route: 'ໂພນໄຊ ➔ ໂຮງໝໍ 150 ຕຽງ',
    dist: '2.8 ກມ • ມໍໄຊ'
  }
];
