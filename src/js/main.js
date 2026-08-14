import '../style.css';
import {
  registerServiceWorker,
  bootPwaInstall,
  promptInstallApp,
  hidePwaMiniTip
} from './pwa.js';
import { ST } from './state.js';
import { onSearch, swapLocations, bindSearchDismiss, applyMapPoint, setPickTarget, confirmMapCenter, onMapSearch, setMapSearchTarget, onMapSearchFocus } from './geocode.js';
import {
  bootBookingUI,
  showLocationStep,
  showRideStep,
  focusLocField,
  syncLocSummary
} from './booking.js';
import {
  bootSheetUI,
  toggleMapExpand,
  setSheetSnap,
  expandMap,
  restoreSheet,
  sizeSheetForRide
} from './sheet.js';
import {
  openDriverApply,
  driverApplyNext,
  driverApplyBack,
  startDriveAfterApply
} from './driverApply.js';
import {
  initMap,
  toggleMapStyle,
  recenterMap,
  getCurrentLocation,
  setMapPlaceHandler,
  fitActiveRoute
} from './map.js';
import {
  setSvc,
  selectVehicle,
  adjFare,
  findDriver,
  acceptDriverBid,
  counterToDriver,
  cancelRequest,
  completeTrip,
  setRating,
  submitReview,
  bootPassengerListeners
} from './passenger.js';
import {
  switchRole,
  toggleDriverOnline,
  renderDriverFeed,
  adjDriverCounter,
  driverTakeJob,
  driverSendCounter,
  bootDriverListeners,
  refreshDriverStats
} from './driver.js';
import {
  setPayment,
  showQR,
  confirmQR,
  refreshWalletUI,
  topUpWallet
} from './wallet.js';
import { quickChat, sendChat, startCall, endCall } from './chat.js';
import { callPolice, shareLiveLocation } from './sos.js';
import { renderHistory, openHistory } from './history.js';
import {
  show,
  toggleSidebar,
  openModal,
  closeModal,
  toast
} from './ui.js';
import { loadDB } from './persist.js';
import {
  startSplash,
  onAppReady,
  goTab,
  goFlow,
  openScreen,
  closeScreen,
  onboardingNext,
  onboardingSkip,
  renderOnboardingRestart,
  submitLogin,
  logout,
  openWalletPage,
  openActivityPage,
  openPaymentSheet,
  selectPayMethod,
  walletTopUp,
  openBCELFromWallet,
  markNotifRead,
  markAllNotifsRead,
  saveProfile,
  saveSetting,
  copyPromo,
  refreshChrome
} from './screens.js';

function toggleLanguage() {
  ST.lang = ST.lang === 'lo' ? 'en' : 'lo';
  const label = document.getElementById('lang-label');
  if (label) label.innerText = ST.lang === 'lo' ? 'ລາວ' : 'EN';
  toast(ST.lang === 'lo' ? '🇱🇦 ພາສາລາວ' : '🇬🇧 English');
}

function openWallet() {
  openWalletPage();
}

function openHistoryModal() {
  openActivityPage();
}

function bootAppCore() {
  setMapPlaceHandler((type, lat, lng) => {
    applyMapPoint(type, lat, lng);
  });
  initMap();
  bindSearchDismiss();
  bootBookingUI();
  bootSheetUI();
  bootPassengerListeners();
  bootDriverListeners();
  refreshWalletUI(loadDB());
  refreshDriverStats(loadDB());
  renderHistory();
  renderDriverFeed();
  refreshChrome();

  document.getElementById('fare-input')?.addEventListener('input', function () {
    ST.fare = parseInt(this.value, 10) || 0;
    const badge = document.getElementById('route-fare-badge');
    if (badge)
      badge.innerHTML = `<i class="fa-solid fa-coins"></i> ${ST.fare.toLocaleString()} ₭`;
  });

  setTimeout(() => {
    if (window.__idriveMap?.invalidateSize) window.__idriveMap.invalidateSize();
  }, 200);
}

Object.assign(window, {
  toggleSidebar,
  switchRole,
  setSvc,
  selectVehicle,
  adjFare,
  swapLocations,
  getCurrentLocation,
  fitActiveRoute,
  findDriver,
  cancelRequest,
  completeTrip,
  setRating,
  submitReview,
  acceptDriverBid,
  counterToDriver,
  openModal,
  closeModal,
  toast,
  recenterMap,
  toggleMapStyle,
  toggleDriverOnline,
  renderDriverFeed,
  adjDriverCounter,
  driverTakeJob,
  driverSendCounter,
  toggleLanguage,
  onSearch,
  setPayment,
  showQR,
  confirmQR,
  topUpWallet,
  quickChat,
  sendChat,
  startCall,
  endCall,
  callPolice,
  shareLiveLocation,
  openWallet,
  openHistoryModal,
  show,
  goTab,
  goFlow,
  openScreen,
  closeScreen,
  onboardingNext,
  onboardingSkip,
  renderOnboardingRestart,
  submitLogin,
  logout,
  openWalletPage,
  openActivityPage,
  openPaymentSheet,
  selectPayMethod,
  walletTopUp,
  openBCELFromWallet,
  markNotifRead,
  markAllNotifsRead,
  saveProfile,
  saveSetting,
  copyPromo,
  setPickTarget,
  confirmMapCenter,
  applyMapPoint,
  showLocationStep,
  showRideStep,
  focusLocField,
  syncLocSummary,
  toggleMapExpand,
  setSheetSnap,
  expandMap,
  restoreSheet,
  sizeSheetForRide,
  onMapSearch,
  setMapSearchTarget,
  onMapSearchFocus,
  openDriverApply,
  driverApplyNext,
  driverApplyBack,
  startDriveAfterApply,
  promptInstallApp,
  hidePwaMiniTip
});

registerServiceWorker();

window.addEventListener('load', () => {
  onAppReady(bootAppCore);
  bootPwaInstall();
  startSplash();
});
