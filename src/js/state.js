/** Shared reactive app state */
export const ST = {
  role: 'passenger',
  service: 'city',
  fare: 30000,
  vehicle: 'ride',
  payment: 'ເງິນສົດ',
  paymentKey: 'cash',
  lang: 'lo',
  pickup: null,
  dest: null,
  mapFocus: 'dest',
  routeDistance: null,
  routeTime: null,
  mapStyleIdx: 0,
  activeOrderId: null,
  tripPhase: null,
  driverOnline: true,
  pendingRating: 5,
  callTimer: null
};

export const FARE_PER_KM = {
  ride: 5000,
  moto: 3000,
  comfort: 7000,
  suv: 9000
};

export const BASE_FARE = {
  ride: 15000,
  moto: 8000,
  comfort: 20000,
  suv: 30000
};
