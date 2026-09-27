import { describe, expect, it, vi } from 'vitest';
import type { JukeboxRepository } from './ports/jukebox.repository.js';
import type { SpotifyCatalogProvider, SpotifyTrack } from '../integrations/spotify/ports/spotify-catalog.port.js';
import { JukeboxService } from './jukebox.service.js';
import { ForbiddenError } from '../../core/errors/app-error.js';
import { systemClock } from '../../core/infra/system-clock.js';

const track = (spotify_uri: string, explicit = false): SpotifyTrack => ({
  spotify_uri,
  spotify_id: spotify_uri.split(':').at(-1)!,
  title: 'Track',
  artist: 'Artist',
  artist_id: 'artist-id',
  album: 'Album',
  cover_url: '',
  duration_ms: 180_000,
  explicit,
  popularity: 50,
});

describe('JukeboxService.triggerAutoplay', () => {
  it('requires an authorized device, filters unsafe tracks, and publishes the queued item', async () => {
    const queuedTracks: SpotifyTrack[] = [];
    const repository = {
      getAutoplayConfig: vi.fn().mockResolvedValue({ radioProfileId: 'profile-id', playlistUri: 'spotify:playlist:1234567890123456789012' }),
      enqueueAutoplay: vi.fn(async ({ tracks }: { tracks: SpotifyTrack[] }) => {
        queuedTracks.push(...tracks);
        return { kind: 'queued' as const, title: tracks[0]!.title };
      }),
      readQueue: vi.fn().mockResolvedValue({ rows: [], currentSong: null }),
    } as unknown as JukeboxRepository;
    const spotify = {
      getPlaylistTracks: vi.fn().mockResolvedValue([track('spotify:track:clean'), track('spotify:track:explicit', true)]),
    } as unknown as SpotifyCatalogProvider;
    const admission = { canQueueSpotifyTrack: vi.fn(async (candidate: SpotifyTrack) => candidate.spotify_uri.endsWith(':clean')) };
    const events = { queueUpdated: vi.fn(), songSkipped: vi.fn(), forceLogout: vi.fn() };
    const service = new JukeboxService(repository, spotify, admission, systemClock, events);

    const result = await service.triggerAutoplay({ deviceId: 'device-id', credential: 'secret' });

    expect(repository.getAutoplayConfig).toHaveBeenCalledWith({ deviceId: 'device-id', credential: 'secret' });
    expect(queuedTracks.map(({ spotify_uri }) => spotify_uri)).toEqual(['spotify:track:clean']);
    expect(result).toEqual({ kind: 'queued', title: 'Track' });
    expect(events.queueUpdated).toHaveBeenCalledWith('device-id', expect.any(Object));
  });

  it('does not request Spotify playlist data without a configured playlist', async () => {
    const repository = {
      getAutoplayConfig: vi.fn().mockResolvedValue({ radioProfileId: null, playlistUri: null }),
      enqueueAutoplay: vi.fn(),
      enqueueLocalAutoplay: vi.fn().mockResolvedValue({ kind: 'empty' as const }),
    } as unknown as JukeboxRepository;
    const spotify = { getPlaylistTracks: vi.fn() } as unknown as SpotifyCatalogProvider;
    const service = new JukeboxService(repository, spotify, { canQueueSpotifyTrack: vi.fn() }, systemClock);

    await expect(service.triggerAutoplay({ deviceId: 'device-id', credential: 'secret' })).resolves.toEqual({ kind: 'unconfigured' });
    expect(spotify.getPlaylistTracks).not.toHaveBeenCalled();
    expect(repository.enqueueLocalAutoplay).toHaveBeenCalledWith({ deviceId: 'device-id', credential: 'secret', radioProfileId: null });
  });
});

describe('JukeboxService.getQueue access policy', () => {
  it('does not let an administrator read a device queue without a connected user session', async () => {
    const repository = {
      canReadQueue: vi.fn().mockResolvedValue(false),
      readQueue: vi.fn(),
    } as unknown as JukeboxRepository;
    const service = new JukeboxService(repository, {} as SpotifyCatalogProvider, { canQueueSpotifyTrack: vi.fn() }, systemClock);

    await expect(service.getQueue({ deviceId: 'device-id', userId: 'admin-id', isAdmin: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.canReadQueue).toHaveBeenCalledWith({ deviceId: 'device-id', userId: 'admin-id', isAdmin: false });
    expect(repository.readQueue).not.toHaveBeenCalled();
  });
});

describe('JukeboxService Spotify heartbeat recovery', () => {
  it('finishes an ended Spotify track, starts the next queued track, and publishes the queue', async () => {
    const repository = {
      updateKioskHeartbeat: vi.fn().mockResolvedValue(true),
      getSpotifyRecoveryContext: vi.fn().mockResolvedValue({
        currentSong: { sourceType: 'spotify', spotifyUri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', durationMs: 180_000 },
        targetDeviceId: 'spotify-connect-id', targetIsActive: true,
      }),
      finishCurrentTrack: vi.fn().mockResolvedValue(undefined),
      getNextPendingTrack: vi.fn().mockResolvedValue({ id: 'queue-2', songId: 'song-2', sourceType: 'spotify', spotifyUri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb' }),
      startRecoveredTrack: vi.fn().mockResolvedValue(true),
      readQueue: vi.fn().mockResolvedValue({ rows: [], currentSong: null }),
    } as unknown as JukeboxRepository;
    const spotify = {} as SpotifyCatalogProvider;
    const playback = { getState: vi.fn().mockResolvedValue({ deviceId: 'spotify-connect-id', isPlaying: false, progressMs: 179_500 }), play: vi.fn().mockResolvedValue(undefined) };
    const events = { queueUpdated: vi.fn(), songSkipped: vi.fn(), songRejected: vi.fn(), forceLogout: vi.fn(), kioskHeartbeat: vi.fn(), playbackProgress: vi.fn() };
    const service = new JukeboxService(repository, spotify, { canQueueSpotifyTrack: vi.fn() }, systemClock, events);
    service.setPlaybackProvider(playback as never);

    await service.kioskHeartbeat({ deviceId: 'device-id', credential: 'secret' });

    expect(repository.finishCurrentTrack).toHaveBeenCalledWith('device-id');
    expect(playback.play).toHaveBeenCalledWith('device-id', { provider: 'spotify', uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb' });
    expect(repository.startRecoveredTrack).toHaveBeenCalledWith('device-id', 'queue-2', 'song-2');
    expect(events.queueUpdated).toHaveBeenCalledWith('device-id', expect.any(Object));
  });

  it('keeps a currently playing track and does not dispatch the queue', async () => {
    const repository = {
      updateKioskHeartbeat: vi.fn().mockResolvedValue(true),
      getSpotifyRecoveryContext: vi.fn().mockResolvedValue({ currentSong: { sourceType: 'spotify', spotifyUri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', durationMs: 180_000 }, targetDeviceId: 'spotify-connect-id', targetIsActive: true }),
    } as unknown as JukeboxRepository;
    const playback = { getState: vi.fn().mockResolvedValue({ deviceId: 'spotify-connect-id', isPlaying: true, itemUri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa' }), play: vi.fn() };
    const service = new JukeboxService(repository, {} as SpotifyCatalogProvider, { canQueueSpotifyTrack: vi.fn() }, systemClock);
    service.setPlaybackProvider(playback as never);

    await service.kioskHeartbeat({ deviceId: 'device-id', credential: 'secret' });

    expect(playback.play).not.toHaveBeenCalled();
    expect(repository.finishCurrentTrack).toBeUndefined();
  });
});
