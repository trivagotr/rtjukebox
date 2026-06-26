import { describe, expect, it, vi } from 'vitest';
import {
  createFallbackGuestSession,
  FALLBACK_GUEST_SESSION_STORAGE_KEY,
  ensureFallbackGuestSession,
  shouldPromptForQrGuestName,
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

    expect(postGuest).toHaveBeenCalledWith('http://api.test', 'Jukebox Guest');
    expect(storage.getItem(FALLBACK_GUEST_SESSION_STORAGE_KEY)).toBe(JSON.stringify(createdSession));
  });

  it('creates a named fallback guest session for QR visitors', async () => {
    const storage = createStorage();
    const namedSession = createSession({
      access_token: 'ada-token',
      user: {
        ...createSession().user,
        display_name: 'Ada',
      },
    });
    const postGuest = vi.fn().mockResolvedValue(namedSession);

    await expect(createFallbackGuestSession('http://api.test', '  Ada  ', storage, postGuest)).resolves.toEqual(namedSession);

    expect(postGuest).toHaveBeenCalledWith('http://api.test', 'Ada');
    expect(storage.getItem(FALLBACK_GUEST_SESSION_STORAGE_KEY)).toBe(JSON.stringify(namedSession));
  });

  it('prompts for a fresh name when a QR visitor has a stored guest session', () => {
    expect(shouldPromptForQrGuestName({
      deviceCode: 'FALLBACK1',
      savedUser: JSON.stringify({
        id: 'guest-1',
        display_name: 'Previous Visitor',
        is_guest: true,
      }),
      savedToken: 'guest-token',
    })).toBe(true);
  });

  it('does not force the QR name prompt for signed-in users', () => {
    expect(shouldPromptForQrGuestName({
      deviceCode: 'FALLBACK1',
      savedUser: JSON.stringify({
        id: 'user-1',
        display_name: 'Student',
        is_guest: false,
      }),
      savedToken: 'user-token',
    })).toBe(false);
  });
});
