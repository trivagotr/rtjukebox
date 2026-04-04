import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_FINGERPRINT_STORAGE_KEY = 'rtjukebox.guestFingerprint';
const GUEST_FINGERPRINT_HEADER = 'x-guest-fingerprint';

type GuestFingerprintStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

let cachedGuestFingerprint: string | null = null;
let pendingGuestFingerprintPromise: Promise<string> | null = null;

function generateGuestFingerprint() {
  return `guest-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export async function getGuestFingerprint(storage: GuestFingerprintStorage = AsyncStorage) {
  if (cachedGuestFingerprint) {
    return cachedGuestFingerprint;
  }

  if (!pendingGuestFingerprintPromise) {
    pendingGuestFingerprintPromise = (async () => {
      const existing = await storage.getItem(GUEST_FINGERPRINT_STORAGE_KEY);
      if (existing) {
        cachedGuestFingerprint = existing;
        return existing;
      }

      const nextFingerprint = generateGuestFingerprint();
      await storage.setItem(GUEST_FINGERPRINT_STORAGE_KEY, nextFingerprint);
      cachedGuestFingerprint = nextFingerprint;
      return nextFingerprint;
    })().finally(() => {
      pendingGuestFingerprintPromise = null;
    });
  }

  return pendingGuestFingerprintPromise;
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

export function resetGuestFingerprintCache() {
  cachedGuestFingerprint = null;
  pendingGuestFingerprintPromise = null;
}
