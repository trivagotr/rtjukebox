import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import {
  getGuestFingerprint,
  buildGuestQueueHeaders,
  GUEST_FINGERPRINT_STORAGE_KEY,
  resetGuestFingerprintCache,
} from '../src/services/guestFingerprint';

describe('guestFingerprint helper', () => {
  beforeEach(() => {
    resetGuestFingerprintCache();
  });

  it('persists and reuses the same fingerprint', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };

    const first = await getGuestFingerprint(storage as any);
    const second = await getGuestFingerprint(storage as any);

    expect(first).toBe(second);
    expect(store.get(GUEST_FINGERPRINT_STORAGE_KEY)).toBe(first);
  });

  it('shares a single in-flight fingerprint creation', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: jest.fn(
        async () =>
          new Promise<string | null>((resolve) => {
            setTimeout(() => resolve(store.get(GUEST_FINGERPRINT_STORAGE_KEY) ?? null), 0);
          }),
      ),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };

    const [first, second] = await Promise.all([
      getGuestFingerprint(storage as any),
      getGuestFingerprint(storage as any),
    ]);

    expect(first).toBe(second);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('builds the guest header only for guest requests', async () => {
    const storage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
    };

    const headers = await buildGuestQueueHeaders(true, storage as any);

    expect(headers).toHaveProperty('x-guest-fingerprint');
    expect(typeof headers['x-guest-fingerprint']).toBe('string');
  });
});
