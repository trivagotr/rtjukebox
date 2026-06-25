import axios from 'axios';

export const FALLBACK_GUEST_SESSION_STORAGE_KEY = 'fallback_guest_session';

export interface FallbackGuestUser {
  id: string;
  display_name: string;
  is_guest: boolean;
  role: string;
  total_songs_added: number;
  last_super_vote_at?: string | null;
}

export interface FallbackGuestSession {
  user: FallbackGuestUser;
  access_token: string;
}

type GuestSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type PostGuestSession = (apiRoot: string) => Promise<FallbackGuestSession>;

function isFallbackGuestSession(value: unknown): value is FallbackGuestSession {
  if (!value || typeof value !== 'object') return false;

  const session = value as Partial<FallbackGuestSession>;
  const user = session.user as Partial<FallbackGuestUser> | undefined;

  return (
    typeof session.access_token === 'string' &&
    session.access_token.length > 0 &&
    Boolean(user) &&
    typeof user?.id === 'string' &&
    typeof user?.display_name === 'string' &&
    user?.is_guest === true
  );
}

export function readStoredFallbackGuestSession(storage: GuestSessionStorage): FallbackGuestSession | null {
  const rawSession = storage.getItem(FALLBACK_GUEST_SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const parsed = JSON.parse(rawSession);
    if (isFallbackGuestSession(parsed)) return parsed;
  } catch {
    // Drop malformed fallback sessions so the next call can create a fresh one.
  }

  storage.removeItem(FALLBACK_GUEST_SESSION_STORAGE_KEY);
  return null;
}

async function defaultPostGuestSession(apiRoot: string): Promise<FallbackGuestSession> {
  const response = await axios.post<{ data: FallbackGuestSession }>(`${apiRoot}/api/v1/auth/guest`, {
    display_name: 'Jukebox Guest',
  });

  return response.data.data;
}

export async function ensureFallbackGuestSession(
  apiRoot: string,
  storage: GuestSessionStorage = window.localStorage,
  postGuestSession: PostGuestSession = defaultPostGuestSession,
): Promise<FallbackGuestSession> {
  const storedSession = readStoredFallbackGuestSession(storage);
  if (storedSession) return storedSession;

  const session = await postGuestSession(apiRoot);
  storage.setItem(FALLBACK_GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}
