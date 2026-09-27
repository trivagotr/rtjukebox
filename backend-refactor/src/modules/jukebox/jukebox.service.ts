import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../core/errors/app-error.js';
import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { SpotifyTrack } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { JukeboxRepository } from './ports/jukebox.repository.js';
import { noJukeboxEvents, type JukeboxEvents } from './ports/jukebox-events.port.js';
import { toQueueStateDto } from './jukebox.dto.js';
import type { PlaybackProvider } from '../integrations/spotify/ports/playback-provider.port.js';
import type { Clock } from '../../core/ports/clock.port.js';

export class JukeboxService {
  private playback: PlaybackProvider | undefined;
  private readonly recoveryChecks = new Map<string, number>();

  constructor(private readonly repository: JukeboxRepository, private readonly spotify: SpotifyCatalogProvider, private readonly catalogAdmission: { canQueueSpotifyTrack(track: SpotifyTrack): Promise<boolean> }, private readonly clock: Clock, private readonly events: JukeboxEvents = noJukeboxEvents) {}

  setPlaybackProvider(provider: PlaybackProvider) { this.playback = provider; }

  canReadQueue(input: { deviceId: string; userId?: string; isAdmin: boolean; kioskCredential?: string }) {
    return this.repository.canReadQueue({ ...input, isAdmin: false });
  }

  private async publishQueueUpdated(deviceId: string) {
    try {
      const state = this.repository.readQueue(deviceId).then((queue) => toQueueStateDto(queue.rows, queue.currentSong));
      this.events.queueUpdated(deviceId, await state);
    } catch { /* Realtime delivery must not fail the committed API operation. */ }
  }

  async getQueue(input: { deviceId: string; userId?: string; isAdmin: boolean; kioskCredential?: string }) {
    // Queue reads require a device session or its kiosk credential, even for administrator accounts.
    const allowed = await this.canReadQueue(input);
    if (!allowed) throw new ForbiddenError('An active device session is required');
    const state = await this.repository.readQueue(input.deviceId, input.userId);
    return toQueueStateDto(state.rows, state.currentSong);
  }

  async connect(input: { deviceCode: string; userId?: string }) {
    const device = await this.repository.connectDevice(input);
    if (!device) return null;
    const queue = input.userId
      ? await this.getQueue({ deviceId: device.id, userId: input.userId, isAdmin: false })
      : { now_playing: null, queue: [] };
    return { device, queue };
  }

  disconnect(input: { deviceId: string; userId: string }) {
    return this.repository.disconnectDevice(input);
  }

  async addSong(input: { deviceId: string; userId: string; songId?: string; spotifyUri?: string; guestFingerprint?: string }) {
    if (input.songId) {
      const result = await this.repository.addSong({ deviceId: input.deviceId, userId: input.userId, songId: input.songId, guestFingerprint: input.guestFingerprint });
      if (result.kind === 'created') await this.publishQueueUpdated(input.deviceId);
      return result;
    }
    let track: SpotifyTrack;
    try { track = await this.spotify.getTrackByUri(input.spotifyUri!, 'TR'); }
    catch (error) { throw new ServiceUnavailableError('Spotify catalog is unavailable', 'SPOTIFY_UNAVAILABLE', { cause: error }); }
    if (!await this.catalogAdmission.canQueueSpotifyTrack(track)) return { kind: 'moderated' as const };
    const result = await this.repository.addSong({ deviceId: input.deviceId, userId: input.userId, spotifyTrack: track, guestFingerprint: input.guestFingerprint });
    if (result.kind === 'created') await this.publishQueueUpdated(input.deviceId);
    return result;
  }

  async vote(input: { userId: string; deviceId: string; queueItemId?: string; songId?: string; vote: -1 | 1; isSuper?: boolean }) {
    const result = await this.repository.vote(input);
    if (result.kind === 'voted') {
      if (result.skipped && input.queueItemId) this.events.songSkipped(input.deviceId, input.queueItemId);
      await this.publishQueueUpdated(input.deviceId);
    }
    return result;
  }

  async kioskHeartbeat(input: { deviceId: string; credential: string }) {
    if (!await this.repository.updateKioskHeartbeat(input)) throw new ForbiddenError('Invalid or expired kiosk credential');
    await this.recoverStoppedSpotifyPlayback(input);
  }

  private async recoverStoppedSpotifyPlayback(input: { deviceId: string; credential: string }) {
    const now = this.clock.now().getTime();
    const lastCheck = this.recoveryChecks.get(input.deviceId) ?? 0;
    if (!this.playback || now - lastCheck < 20_000) return;
    this.recoveryChecks.set(input.deviceId, now);
    try {
      const context = await this.repository.getSpotifyRecoveryContext(input.deviceId);
      if (!context?.targetIsActive || !context.targetDeviceId) return;
      const state = await this.playback.getState(input.deviceId);
      const current = context.currentSong;
      if (current && (current.sourceType !== 'spotify' || !current.spotifyUri)) return;
      if (!current && state?.isPlaying) return;
      if (state?.deviceId && state.deviceId !== context.targetDeviceId) return;
      if (current && state?.isPlaying && (!state.itemUri || state.itemUri === current.spotifyUri)) return;
      if (current && state && !state.isPlaying) {
        const nearEnd = current.durationMs === null ? 0 : Math.max(0, current.durationMs - 1_500);
        if (typeof state.progressMs !== 'number' || (state.progressMs > 1_500 && state.progressMs < nearEnd)) return;
      }

      if (current) await this.repository.finishCurrentTrack(input.deviceId);
      let next = await this.repository.getNextPendingTrack(input.deviceId);
      if (!next) {
        await this.triggerAutoplay(input);
        next = await this.repository.getNextPendingTrack(input.deviceId);
      }
      if (!next) {
        await this.publishQueueUpdated(input.deviceId);
        return;
      }
      if (next.sourceType === 'spotify' && next.spotifyUri) {
        await this.playback.play(input.deviceId, { provider: 'spotify', uri: next.spotifyUri });
      }
      if (await this.repository.startRecoveredTrack(input.deviceId, next.id, next.songId)) await this.publishQueueUpdated(input.deviceId);
    } catch {
      // Spotify may be offline or unauthorized; heartbeat and kiosk connectivity must continue.
    }
  }

  async updateNowPlaying(input: { deviceId: string; credential: string; songId: string | null }) {
    const result = await this.repository.updateNowPlaying(input);
    if (result === 'unauthorized') throw new ForbiddenError('Invalid or expired kiosk credential');
    if (result === 'not_found') throw new ForbiddenError('Song must be present in this device queue');
    await this.publishQueueUpdated(input.deviceId);
  }

  async adminSkip(deviceId: string) {
    const result = await this.repository.adminSkip(deviceId);
    if (!result.found) throw new NotFoundError('Device not found');
    if (result.queueItemId) this.events.songSkipped(deviceId, result.queueItemId);
    await this.publishQueueUpdated(deviceId);
    return { deviceId, queueItemId: result.queueItemId };
  }

  async triggerAutoplay(input: { deviceId: string; credential: string }) {
    const config = await this.repository.getAutoplayConfig(input);
    if (!config) throw new ForbiddenError('Invalid or expired kiosk credential');
    const localFallback = async () => this.repository.enqueueLocalAutoplay({ ...input, radioProfileId: config.radioProfileId });
    if (!config.playlistUri) {
      const fallback = await localFallback();
      if (fallback.kind === 'queued') await this.publishQueueUpdated(input.deviceId);
      return fallback.kind === 'empty' ? { kind: 'unconfigured' as const } : fallback;
    }
    let tracks: SpotifyTrack[];
    try {
      tracks = await this.spotify.getPlaylistTracks(config.playlistUri, 'TR', 100);
    } catch (error) {
      const fallback = await localFallback();
      if (fallback.kind === 'queued') await this.publishQueueUpdated(input.deviceId);
      if (fallback.kind !== 'empty') return fallback;
      throw new ServiceUnavailableError('Spotify playlist and local fallback are unavailable', 'SPOTIFY_UNAVAILABLE', { cause: error });
    }
    const eligible: SpotifyTrack[] = [];
    for (const track of tracks) {
      if (track.explicit) continue;
      if (await this.catalogAdmission.canQueueSpotifyTrack(track)) eligible.push(track);
    }
    if (!eligible.length) {
      const fallback = await localFallback();
      if (fallback.kind === 'queued') await this.publishQueueUpdated(input.deviceId);
      return fallback;
    }
    const result = await this.repository.enqueueAutoplay({ ...input, radioProfileId: config.radioProfileId, tracks: eligible });
    if (result.kind === 'queued') await this.publishQueueUpdated(input.deviceId);
    return result;
  }
}
