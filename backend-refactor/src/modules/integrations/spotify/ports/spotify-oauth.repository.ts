export interface SpotifyOAuthStateInput {
  stateHash: string;
  stateKind: 'admin' | 'device';
  adminUserId?: string | null;
  deviceId?: string | null;
  returnOrigin?: string | null;
  codeVerifier: string;
  expiresAt: Date;
}

export interface SpotifyOAuthStateRecord {
  stateKind: 'admin' | 'device';
  adminUserId: string | null;
  adminRole: string | null;
  adminIsGuest: boolean | null;
  deviceId: string | null;
  returnOrigin: string | null;
  codeVerifier: string | null;
}

export interface SpotifyTokenRecord {
  id: string;
  userId: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
}

export interface SpotifyDeviceAuthRecord extends SpotifyTokenRecord {
  deviceId: string;
  spotifyAccountId: string;
  spotifyDisplayName: string;
  spotifyEmail: string | null;
  spotifyProduct: string | null;
  spotifyCountry: string | null;
}

export interface SpotifyOAuthRepository {
  saveOAuthState(input: SpotifyOAuthStateInput): Promise<void>;
  consumeOAuthState(stateHash: string, now: Date): Promise<SpotifyOAuthStateRecord | null>;
  deviceExists(deviceId: string): Promise<boolean>;
  saveGlobalAuth(input: Omit<SpotifyTokenRecord, 'id'>): Promise<void>;
  getGlobalAuth(): Promise<SpotifyTokenRecord | null>;
  saveDeviceAuth(input: Omit<SpotifyDeviceAuthRecord, 'id' | 'userId'>): Promise<void>;
  getDeviceAuth(deviceId: string): Promise<SpotifyDeviceAuthRecord | null>;
  getDeviceAuthStatus(deviceId: string): Promise<Record<string, unknown> | null>;
  listDeviceAuthIds(): Promise<string[]>;
  deleteDeviceAuth(deviceId: string): Promise<boolean>;
  getPlaybackTarget(deviceId: string): Promise<{ targetId: string | null; isActive: boolean } | null>;
}
