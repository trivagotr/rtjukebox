export const GUEST_FINGERPRINT_STORAGE_KEY = 'rtjukebox.guestFingerprint';
const GUEST_FINGERPRINT_HEADER = 'x-guest-fingerprint';

function generateGuestFingerprint() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `guest-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getGuestFingerprint(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const existing = storage.getItem(GUEST_FINGERPRINT_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextFingerprint = generateGuestFingerprint();
  storage.setItem(GUEST_FINGERPRINT_STORAGE_KEY, nextFingerprint);
  return nextFingerprint;
}

export function buildGuestQueueHeaders(isGuest: boolean) {
  if (!isGuest) {
    return {};
  }

  return {
    [GUEST_FINGERPRINT_HEADER]: getGuestFingerprint(),
  };
}
