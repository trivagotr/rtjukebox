import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_FINGERPRINT_STORAGE_KEY = 'rtjukebox.guestFingerprint';
const GUEST_FINGERPRINT_HEADER = 'x-guest-fingerprint';

type GuestFingerprintStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

function generateGuestFingerprint() {
  return `guest-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export async function getGuestFingerprint(storage: GuestFingerprintStorage = AsyncStorage) {
  const existing = await storage.getItem(GUEST_FINGERPRINT_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextFingerprint = generateGuestFingerprint();
  await storage.setItem(GUEST_FINGERPRINT_STORAGE_KEY, nextFingerprint);
  return nextFingerprint;
}

export async function buildGuestQueueHeaders(
  isGuest: boolean,
  storage: GuestFingerprintStorage = AsyncStorage,
) {
  if (!isGuest) {
    return {};
  }

  return {
    [GUEST_FINGERPRINT_HEADER]: await getGuestFingerprint(storage),
  };
}
