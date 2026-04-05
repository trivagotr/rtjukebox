import { describe, expect, it } from 'vitest';
import { getGuestFingerprint, GUEST_FINGERPRINT_STORAGE_KEY } from './guestFingerprint';

function createStorage() {
  const state = new Map<string, string>();

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
    removeItem(key: string) {
      state.delete(key);
    },
  };
}

describe('guest fingerprint helper', () => {
  it('persists a guest fingerprint in localStorage', () => {
    const storage = createStorage();
    storage.removeItem(GUEST_FINGERPRINT_STORAGE_KEY);

    const fingerprint = getGuestFingerprint(storage as any);

    expect(fingerprint).toBeTruthy();
    expect(storage.getItem(GUEST_FINGERPRINT_STORAGE_KEY)).toBe(fingerprint);
  });

  it('returns the same fingerprint for the same browser storage', () => {
    const storage = createStorage();
    storage.removeItem(GUEST_FINGERPRINT_STORAGE_KEY);

    const first = getGuestFingerprint(storage as any);
    const second = getGuestFingerprint(storage as any);

    expect(second).toBe(first);
  });
});
