/** Opens the standalone iDrive Control console */
export function openAdmin() {
  const url = new URL('admin/', window.location.href);
  window.open(url.href, '_blank', 'noopener');
}

export function refreshAdmin() {
  openAdmin();
}

export function adminApprove() {}
export function adminReject() {}
