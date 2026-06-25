import { describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_GUEST_SESSION_STORAGE_KEY,
  ensureFallbackGuestSession,
  type FallbackGuestSession,
} from './fallbackGuestSession';

function createStorage(initial: Record<string, string> = {}) {
  const state = new Map(Object.entries(initial));

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

function createSession(overrides: Partial<FallbackGuestSession> = {}): FallbackGuestSession {
  return {
    access_token: 'guest-token',
    user: {
      id: 'guest-1',
      display_name: 'Jukebox Guest',
      is_guest: true,
      role: 'guest',
      total_songs_added: 0,
      last_super_vote_at: null,
    },
    ...overrides,
  };
}

describe('fallback guest session', () => {
  it('reuses a stored fallback guest session', async () => {
    const storedSession = createSession({ access_token: 'stored-token' });
    const storage = createStorage({
      [FALLBACK_GUEST_SESSION_STORAGE_KEY]: JSON.stringify(storedSession),
    });
    const postGuest = vi.fn();

    await expect(ensureFallbackGuestSession('http://api.test', storage, postGuest)).resolves.toEqual(storedSession);

    expect(postGuest).not.toHaveBeenCalled();
  });

  it('creates and stores a fallback guest session when none exists', async () => {
    const storage = createStorage();
    const createdSession = createSession({ access_token: 'created-token' });
    const postGuest = vi.fn().mockResolvedValue(createdSession);

    await expect(ensureFallbackGuestSession('http://api.test', storage, postGuest)).resolves.toEqual(createdSession);

    expect(postGuest).toHaveBeenCalledWith('http://api.test');
    expect(storage.getItem(FALLBACK_GUEST_SESSION_STORAGE_KEY)).toBe(JSON.stringify(createdSession));
  });
});
