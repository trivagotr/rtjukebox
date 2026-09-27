import { ValidationError } from '../../../../core/errors/app-error.js';
import type { PlaybackDevice, PlaybackProvider, PlaybackState, TrackRef } from '../ports/playback-provider.port.js';
import type { SpotifyOAuthService } from '../spotify-oauth.service.js';

export class SpotifyPlaybackProvider implements PlaybackProvider {
  constructor(private readonly spotify: SpotifyOAuthService) {}

  async play(deviceId: string, trackRef: TrackRef): Promise<void> {
    if (trackRef.provider !== 'spotify') throw new ValidationError('Spotify playback cannot play a local file reference');
    await this.spotify.playTrack(deviceId, trackRef.uri);
  }

  pause(deviceId: string): Promise<void> {
    return this.spotify.pausePlayback(deviceId);
  }

  getState(deviceId: string): Promise<PlaybackState | null> {
    return this.spotify.getPlaybackState(deviceId);
  }

  listDevices(deviceId?: string): Promise<PlaybackDevice[]> {
    return this.spotify.playbackDevices(deviceId);
  }
}
