import type { SpotifyTrack } from '../../integrations/spotify/ports/spotify-catalog.port.js';

export interface QueueItemRecord {
  id: string;
  song_id: string;
  status: string;
  queue_reason: string | null;
  title: string;
  artist: string | null;
  cover_url: string | null;
  duration_ms: number | null;
  spotify_uri: string | null;
  spotify_id: string | null;
  source_type: string | null;
  file_url: string | null;
  asset_role: string | null;
  added_by_name: string | null;
  user_vote?: number | null;
  [key: string]: unknown;
}

export type QueueSongFallback = Omit<QueueItemRecord, 'queue_reason' | 'added_by_name' | 'user_vote'>;

export interface JukeboxRepository {
  connectDevice(input: { deviceCode: string; userId?: string }): Promise<{ id: string; device_code: string; name: string; location: string | null; is_active: boolean; current_song_id: string | null; last_heartbeat: Date | null; created_at: Date } | null>;
  disconnectDevice(input: { deviceId: string; userId: string }): Promise<void>;
  canReadQueue(input: { deviceId: string; userId?: string; isAdmin: boolean; kioskCredential?: string }): Promise<boolean>;
  readQueue(deviceId: string, userId?: string): Promise<{ rows: QueueItemRecord[]; currentSong: QueueSongFallback | null }>;
  updateKioskHeartbeat(input: { deviceId: string; credential: string }): Promise<boolean>;
  getSpotifyRecoveryContext(deviceId: string): Promise<{ currentSong: { sourceType: string | null; spotifyUri: string | null; durationMs: number | null } | null; targetDeviceId: string | null; targetIsActive: boolean } | null>;
  finishCurrentTrack(deviceId: string): Promise<void>;
  getNextPendingTrack(deviceId: string): Promise<{ id: string; songId: string; sourceType: string | null; spotifyUri: string | null } | null>;
  startRecoveredTrack(deviceId: string, queueItemId: string, songId: string): Promise<boolean>;
  updateNowPlaying(input: { deviceId: string; credential: string; songId: string | null }): Promise<'updated' | 'unauthorized' | 'not_found'>;
  adminSkip(deviceId: string): Promise<{ found: boolean; queueItemId: string | null }>;
  getAutoplayConfig(input: { deviceId: string; credential: string }): Promise<{ radioProfileId: string | null; playlistUri: string | null } | null>;
  enqueueAutoplay(input: { deviceId: string; credential: string; radioProfileId: string | null; tracks: SpotifyTrack[] }): Promise<{ kind: 'queued'; title: string } | { kind: 'already_queued' | 'unauthorized' | 'unconfigured' | 'empty' }>;
  enqueueLocalAutoplay(input: { deviceId: string; credential: string; radioProfileId: string | null }): Promise<{ kind: 'queued'; title: string } | { kind: 'already_queued' | 'unauthorized' | 'empty' }>;
  addSong(input: { deviceId: string; userId: string; songId?: string; spotifyTrack?: SpotifyTrack; guestFingerprint?: string }): Promise<{ kind: 'created'; id: string; status: string } | { kind: 'forbidden' } | { kind: 'not_found' } | { kind: 'duplicate' } | { kind: 'user_limit' } | { kind: 'guest_limit' } | { kind: 'fingerprint_required' } | { kind: 'moderated' } | { kind: 'recently_played' }>;
  vote(input: { userId: string; deviceId: string; queueItemId?: string; songId?: string; vote: -1 | 1; isSuper?: boolean }): Promise<{ kind: 'voted'; upvotes: number; downvotes: number; score: number; deviceId: string; userVote: number; skipped: boolean; playing: boolean } | { kind: 'direct'; scoreDelta: number } | { kind: 'not_found' } | { kind: 'forbidden' } | { kind: 'supervote_guest' } | { kind: 'supervote_used' }>;
}
