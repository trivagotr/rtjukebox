import type { PlaybackDevice, PlaybackState } from './playback-provider.port.js';

export interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface SpotifyAccountProfile {
  id: string;
  display_name?: string;
  email?: string;
  product?: string;
  country?: string;
}

export interface SpotifyOAuthHttpProvider {
  requestToken(input: { clientId: string; clientSecret: string; form: URLSearchParams }): Promise<SpotifyTokenResponse>;
  getAccountProfile(accessToken: string): Promise<SpotifyAccountProfile>;
  getPlaybackState(accessToken: string): Promise<PlaybackState | null>;
  playTrack(input: { accessToken: string; targetDeviceId: string; trackUri: string }): Promise<void>;
  pausePlayback(input: { accessToken: string; targetDeviceId: string }): Promise<void>;
  listPlaybackDevices(accessToken: string): Promise<PlaybackDevice[]>;
}
