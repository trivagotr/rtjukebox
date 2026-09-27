import { describe, expect, it, vi } from 'vitest';
import type { SpotifyOAuthService } from '../spotify-oauth.service.js';
import { SpotifyPlaybackProvider } from './spotify-playback-provider.adapter.js';

describe('SpotifyPlaybackProvider port adapter', () => {
  it('routes Spotify track play, pause, and state calls through the OAuth service', async () => {
    const spotify = {
      playTrack: vi.fn().mockResolvedValue(undefined),
      pausePlayback: vi.fn().mockResolvedValue(undefined),
      getPlaybackState: vi.fn().mockResolvedValue({ isPlaying: true }),
      playbackDevices: vi.fn().mockResolvedValue([]),
    } as unknown as SpotifyOAuthService;
    const provider = new SpotifyPlaybackProvider(spotify);

    await provider.play('device-1', { provider: 'spotify', uri: 'spotify:track:1234567890123456789012' });
    await provider.pause('device-1');
    await provider.getState('device-1');

    expect(spotify.playTrack).toHaveBeenCalledWith('device-1', 'spotify:track:1234567890123456789012');
    expect(spotify.pausePlayback).toHaveBeenCalledWith('device-1');
    expect(spotify.getPlaybackState).toHaveBeenCalledWith('device-1');
  });

  it('does not pass local media through a Spotify provider', async () => {
    const spotify = { playTrack: vi.fn() } as unknown as SpotifyOAuthService;
    const provider = new SpotifyPlaybackProvider(spotify);
    await expect(provider.play('device-1', { provider: 'local', fileUrl: '/uploads/songs/a.mp3' })).rejects.toMatchObject({ statusCode: 400 });
    expect(spotify.playTrack).not.toHaveBeenCalled();
  });
});
