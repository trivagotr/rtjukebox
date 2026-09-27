import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { kioskSecretMatches } from '../../../core/security/kiosk-credential.js';
import type { JukeboxRepository, QueueItemRecord, QueueSongFallback } from '../ports/jukebox.repository.js';
import type { SpotifyTrack } from '../../integrations/spotify/ports/spotify-catalog.port.js';

function toQueueItemRecord(item: {
  id: string; songId: string; status: string | null; queueReason: string; priorityScore: { toString(): string } | null;
  upvotes: number | null; downvotes: number | null; position: number | null; addedAt: Date | null; playedAt: Date | null;
  song: { title: string; artist: string; coverUrl: string | null; durationMs: number | null; spotifyUri: string | null; spotifyId: string | null; sourceType: string | null; fileUrl: string | null; assetRole: string | null };
  requester: { displayName: string };
  votes: Array<{ voteType: number }>;
}): QueueItemRecord {
  return {
    id: item.id,
    song_id: item.songId,
    status: item.status ?? 'pending',
    queue_reason: item.queueReason,
    priority_score: item.priorityScore?.toString() ?? '0',
    upvotes: item.upvotes ?? 0,
    downvotes: item.downvotes ?? 0,
    position: item.position,
    added_at: item.addedAt,
    played_at: item.playedAt,
    title: item.song.title,
    artist: item.song.artist,
    cover_url: item.song.coverUrl,
    duration_ms: item.song.durationMs,
    spotify_uri: item.song.spotifyUri,
    spotify_id: item.song.spotifyId,
    source_type: item.song.sourceType,
    file_url: item.song.fileUrl,
    asset_role: item.song.assetRole,
    added_by_name: item.requester.displayName,
    ...(item.votes.length ? { user_vote: item.votes[0]!.voteType } : {}),
  };
}

const queueInclude = (userId?: string) => ({
  song: { select: { title: true, artist: true, coverUrl: true, durationMs: true, spotifyUri: true, spotifyId: true, sourceType: true, fileUrl: true, assetRole: true } },
  requester: { select: { displayName: true } },
  votes: { where: { userId: userId ?? '00000000-0000-0000-0000-000000000000' }, select: { voteType: true }, take: 1 },
});

export class PrismaJukeboxRepository implements JukeboxRepository {
  constructor(private readonly client: PrismaClient) {}

  async connectDevice(input: { deviceCode: string; userId?: string }) {
    const device = await this.client.device.findFirst({
      where: { deviceCode: input.deviceCode.trim().toUpperCase(), isActive: true },
      select: { id: true, deviceCode: true, name: true, location: true, isActive: true, currentSongId: true, lastHeartbeat: true, createdAt: true },
    });
    if (!device) return null;
    if (input.userId) {
      await this.client.deviceSession.upsert({
        where: { userId_deviceId: { userId: input.userId, deviceId: device.id } },
        create: { userId: input.userId, deviceId: device.id },
        update: {},
      });
    }
    return {
      id: device.id,
      device_code: device.deviceCode,
      name: device.name,
      location: device.location,
      is_active: device.isActive === true,
      current_song_id: device.currentSongId,
      last_heartbeat: device.lastHeartbeat,
      created_at: device.createdAt ?? new Date(0),
    };
  }

  async disconnectDevice(input: { deviceId: string; userId: string }) {
    await this.client.deviceSession.deleteMany({ where: { userId: input.userId, deviceId: input.deviceId } });
  }

  async canReadQueue(input: { deviceId: string; userId?: string; isAdmin: boolean; kioskCredential?: string }) {
    const device = await this.client.device.findUnique({ where: { id: input.deviceId }, select: { isActive: true } });
    if (!device?.isActive) return false;
    if (input.isAdmin) return true;
    if (input.userId) {
      const session = await this.client.deviceSession.findUnique({
        where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
        select: { id: true },
      });
      if (session) return true;
    }
    if (!input.kioskCredential) return false;
    const credential = await this.client.kioskCredential.findUnique({
      where: { deviceId: input.deviceId },
      select: { credentialHash: true, expiresAt: true, revokedAt: true },
    });
    return Boolean(credential && !credential.revokedAt && credential.expiresAt > new Date()
      && kioskSecretMatches(credential.credentialHash, input.kioskCredential));
  }

  async readQueue(deviceId: string, userId?: string) {
    const include = queueInclude(userId);
    const [playing, pending] = await Promise.all([
      this.client.queueItem.findMany({ where: { deviceId, status: 'playing' }, include, take: 20 }),
      this.client.queueItem.findMany({
        where: { deviceId, status: 'pending' },
        include,
        orderBy: [{ priorityScore: 'desc' }, { addedAt: 'asc' }],
        take: 200,
      }),
    ]);
    const orderedPending = [...pending].sort((left, right) => {
      const autoplayOrder = Number(left.queueReason === 'autoplay') - Number(right.queueReason === 'autoplay');
      if (autoplayOrder !== 0) return autoplayOrder;
      const scoreOrder = Number(right.priorityScore ?? 0) - Number(left.priorityScore ?? 0);
      if (scoreOrder !== 0) return scoreOrder;
      return (left.addedAt?.getTime() ?? 0) - (right.addedAt?.getTime() ?? 0);
    });
    const rows = [...playing, ...orderedPending].map(toQueueItemRecord);
    if (playing.length) return { rows, currentSong: null };

    const device = await this.client.device.findUnique({ where: { id: deviceId }, select: { currentSongId: true } });
    const song = device?.currentSongId
      ? await this.client.song.findUnique({
        where: { id: device.currentSongId },
        select: { id: true, title: true, artist: true, coverUrl: true, durationMs: true, spotifyUri: true, spotifyId: true, sourceType: true, fileUrl: true, assetRole: true },
      })
      : null;
    const currentSong: QueueSongFallback | null = song ? {
      id: song.id,
      song_id: song.id,
      title: song.title,
      artist: song.artist,
      cover_url: song.coverUrl,
      duration_ms: song.durationMs,
      spotify_uri: song.spotifyUri,
      spotify_id: song.spotifyId,
      source_type: song.sourceType,
      file_url: song.fileUrl,
      asset_role: song.assetRole,
      status: 'playing',
      is_autoplay: true,
      added_by_name: 'Radio TEDU (Otomatik)',
    } : null;
    return { rows, currentSong };
  }

  async updateKioskHeartbeat(input: { deviceId: string; credential: string }) {
    return this.client.$transaction(async (tx) => {
      const [device, stored] = await Promise.all([
        tx.device.findUnique({ where: { id: input.deviceId }, select: { isActive: true, lastHeartbeat: true } }),
        tx.kioskCredential.findUnique({ where: { deviceId: input.deviceId }, select: { credentialHash: true, expiresAt: true, revokedAt: true } }),
      ]);
      const now = new Date();
      if (!device?.isActive || !stored || stored.revokedAt || stored.expiresAt <= now || !kioskSecretMatches(stored.credentialHash, input.credential)) return false;
      if (device.lastHeartbeat && now.getTime() - device.lastHeartbeat.getTime() < 5_000) return true;
      await tx.device.update({ where: { id: input.deviceId }, data: { lastHeartbeat: now } });
      return true;
    }, { isolationLevel: 'Serializable' });
  }

  async getSpotifyRecoveryContext(deviceId: string) {
    const device = await this.client.device.findUnique({
      where: { id: deviceId },
      select: {
        spotifyPlaybackDeviceId: true,
        spotifyPlayerIsActive: true,
        currentSongId: true,
      },
    });
    if (!device) return null;
    const currentSong = device.currentSongId
      ? await this.client.song.findUnique({ where: { id: device.currentSongId }, select: { sourceType: true, spotifyUri: true, durationMs: true } })
      : null;
    return {
      currentSong,
      targetDeviceId: device.spotifyPlaybackDeviceId,
      targetIsActive: device.spotifyPlayerIsActive,
    };
  }

  async finishCurrentTrack(deviceId: string) {
    await this.client.$transaction(async (tx) => {
      const current = await tx.queueItem.findFirst({ where: { deviceId, status: 'playing' }, select: { id: true, queueReason: true, song: { select: { assetRole: true } } } });
      const now = new Date();
      if (current) await tx.queueItem.updateMany({ where: { id: current.id, status: 'playing' }, data: { status: 'played', playedAt: now } });
      await tx.device.updateMany({ where: { id: deviceId }, data: { currentSongId: null } });
      if (!current || !['user', 'admin', 'autoplay'].includes(current.queueReason) || (current.song.assetRole ?? 'music') !== 'music') return;

      const device = await tx.device.findUnique({ where: { id: deviceId }, select: {
        radioProfileId: true, overrideEnabled: true, overrideJingleEveryNSongs: true,
        overrideAdBreakIntervalMinutes: true, lastAdBreakAt: true,
      } });
      if (!device?.radioProfileId) return;
      const profile = await tx.radioProfile.findUnique({ where: { id: device.radioProfileId }, select: { isActive: true, jingleEveryNSongs: true, adBreakIntervalMinutes: true } });
      if (!profile || profile.isActive === false) return;
      const jingleInterval = device.overrideEnabled && device.overrideJingleEveryNSongs !== null
        ? device.overrideJingleEveryNSongs : profile.jingleEveryNSongs;
      const adInterval = device.overrideEnabled && device.overrideAdBreakIntervalMinutes !== null
        ? device.overrideAdBreakIntervalMinutes : profile.adBreakIntervalMinutes;
      const completedCount = await tx.queueItem.count({ where: { deviceId, status: 'played', queueReason: { in: ['user', 'admin', 'autoplay'] }, song: { assetRole: 'music' } } });
      const adDue = Boolean(adInterval && adInterval > 0 && (!device.lastAdBreakAt || now.getTime() - device.lastAdBreakAt.getTime() >= adInterval * 60_000));
      let slotType: 'ad' | 'jingle' | null = null;
      let assets: Array<{ songId: string }> = [];
      if (adDue) {
        slotType = 'ad';
        assets = await tx.radioProfileAsset.findMany({ where: { radioProfileId: device.radioProfileId, slotType: 'ad', song: { sourceType: 'local', visibility: 'hidden', assetRole: 'ad', isBlocked: { not: true }, isActive: { not: false } } }, orderBy: [{ sortOrder: 'asc' }, { song: { title: 'asc' } }], select: { songId: true } });
      } else if (jingleInterval && jingleInterval > 0 && completedCount > 0 && completedCount % jingleInterval === 0) {
        slotType = 'jingle';
        const pool = await tx.radioProfileAsset.findMany({ where: { radioProfileId: device.radioProfileId, slotType: 'jingle', song: { sourceType: 'local', visibility: 'hidden', assetRole: 'jingle', isBlocked: { not: true }, isActive: { not: false } } }, orderBy: [{ sortOrder: 'asc' }, { song: { title: 'asc' } }], select: { songId: true } });
        if (pool.length) assets = [pool[Math.floor(Math.random() * pool.length)]!];
      }
      if (!slotType || assets.length === 0) return;
      const systemUser = await tx.user.upsert({ where: { email: 'system@radiotedu.com' }, create: { email: 'system@radiotedu.com', displayName: 'Radio TEDU', role: 'user' }, update: {}, select: { id: true } });
      const pending = await tx.queueItem.aggregate({ where: { deviceId, status: 'pending' }, _max: { priorityScore: true } });
      const basePriority = Number(pending._max.priorityScore ?? 0);
      for (const [index, asset] of assets.entries()) {
        await tx.queueItem.create({ data: { deviceId, songId: asset.songId, addedBy: systemUser.id, queueReason: slotType, priorityScore: basePriority + assets.length - index, status: 'pending' } });
      }
      if (slotType === 'ad') await tx.device.update({ where: { id: deviceId }, data: { lastAdBreakAt: now } });
    }, { isolationLevel: 'Serializable' });
  }

  async getNextPendingTrack(deviceId: string) {
    const item = await this.client.queueItem.findFirst({
      where: { deviceId, status: 'pending' },
      orderBy: [{ priorityScore: 'desc' }, { addedAt: 'asc' }],
      select: { id: true, songId: true, song: { select: { sourceType: true, spotifyUri: true } } },
    });
    return item ? { id: item.id, songId: item.songId, sourceType: item.song.sourceType, spotifyUri: item.song.spotifyUri } : null;
  }

  async startRecoveredTrack(deviceId: string, queueItemId: string, songId: string) {
    return this.client.$transaction(async (tx) => {
      const pending = await tx.queueItem.updateMany({ where: { id: queueItemId, deviceId, songId, status: 'pending' }, data: { status: 'playing' } });
      if (!pending.count) return false;
      await tx.queueItem.updateMany({ where: { deviceId, status: 'playing', id: { not: queueItemId } }, data: { status: 'played', playedAt: new Date() } });
      await tx.device.update({ where: { id: deviceId }, data: { currentSongId: songId, lastHeartbeat: new Date() } });
      await tx.song.update({ where: { id: songId }, data: { playCount: { increment: 1 }, lastPlayedAt: new Date() } });
      return true;
    }, { isolationLevel: 'Serializable' });
  }

  async updateNowPlaying(input: { deviceId: string; credential: string; songId: string | null }): Promise<'updated' | 'unauthorized' | 'not_found'> {
    const result = await this.client.$transaction(async (tx) => {
      const [device, stored] = await Promise.all([
        tx.device.findUnique({ where: { id: input.deviceId }, select: { isActive: true } }),
        tx.kioskCredential.findUnique({ where: { deviceId: input.deviceId }, select: { credentialHash: true, expiresAt: true, revokedAt: true } }),
      ]);
      const now = new Date();
      if (!device?.isActive || !stored || stored.revokedAt || stored.expiresAt <= now || !kioskSecretMatches(stored.credentialHash, input.credential)) return 'unauthorized';
      if (input.songId === null) {
        return 'completed';
      }
      const byQueueId = await tx.queueItem.findFirst({ where: { id: input.songId, deviceId: input.deviceId, status: { in: ['pending', 'playing'] } }, select: { id: true, songId: true, status: true, queueReason: true, autoplayRadioProfileId: true, song: { select: { spotifyUri: true } } } });
      const target = byQueueId ?? await tx.queueItem.findFirst({ where: { deviceId: input.deviceId, songId: input.songId, status: { in: ['pending', 'playing'] } }, orderBy: [{ priorityScore: 'desc' }, { addedAt: 'asc' }], select: { id: true, songId: true, status: true, queueReason: true, autoplayRadioProfileId: true, song: { select: { spotifyUri: true } } } });
      if (!target) return 'not_found';
      await tx.queueItem.updateMany({ where: { deviceId: input.deviceId, status: 'playing', id: { not: target.id } }, data: { status: 'played', playedAt: now } });
      await tx.queueItem.update({ where: { id: target.id }, data: { status: 'playing' } });
      await tx.device.update({ where: { id: input.deviceId }, data: { currentSongId: target.songId, lastHeartbeat: now } });
      if (target.status !== 'playing') await tx.song.update({ where: { id: target.songId }, data: { playCount: { increment: 1 }, lastPlayedAt: now } });
      if (target.status !== 'playing' && target.queueReason === 'autoplay' && target.autoplayRadioProfileId && target.song.spotifyUri) {
        await tx.radioProfilePlaylistStat.upsert({
          where: { radioProfileId_spotifyUri: { radioProfileId: target.autoplayRadioProfileId, spotifyUri: target.song.spotifyUri } },
          create: { radioProfileId: target.autoplayRadioProfileId, spotifyUri: target.song.spotifyUri, playCount: 1, lastPlayedAt: now },
          update: { playCount: { increment: 1 }, lastPlayedAt: now },
        });
      }
      return 'updated';
    }, { isolationLevel: 'Serializable' });
    if (result === 'completed') {
      await this.finishCurrentTrack(input.deviceId);
      await this.client.device.updateMany({ where: { id: input.deviceId }, data: { lastHeartbeat: new Date() } });
      return 'updated';
    }
    return result;
  }

  async adminSkip(deviceId: string) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.queueItem.findFirst({ where: { deviceId, status: 'playing' }, select: { id: true } });
      if (current) await tx.queueItem.update({ where: { id: current.id }, data: { status: 'skipped', playedAt: new Date() } });
      const device = await tx.device.updateMany({ where: { id: deviceId }, data: { currentSongId: null } });
      return { found: device.count > 0, queueItemId: device.count ? current?.id ?? null : null };
    }, { isolationLevel: 'Serializable' });
  }

  async getAutoplayConfig(input: { deviceId: string; credential: string }) {
    const device = await this.client.device.findFirst({
      where: { id: input.deviceId, isActive: true },
      select: {
        radioProfileId: true,
        overrideEnabled: true,
        overrideAutoplaySpotifyPlaylistUri: true,
        radioProfile: { select: { autoplaySpotifyPlaylistUri: true } },
        kioskCredential: { select: { credentialHash: true, expiresAt: true, revokedAt: true } },
      },
    });
    const stored = device?.kioskCredential;
    if (!device || !stored || stored.revokedAt || stored.expiresAt <= new Date() || !kioskSecretMatches(stored.credentialHash, input.credential)) return null;
    const playlistUri = device.overrideEnabled && device.overrideAutoplaySpotifyPlaylistUri
      ? device.overrideAutoplaySpotifyPlaylistUri
      : device.radioProfile?.autoplaySpotifyPlaylistUri ?? null;
    return { radioProfileId: device.radioProfileId, playlistUri };
  }

  async enqueueAutoplay(input: { deviceId: string; credential: string; radioProfileId: string | null; tracks: SpotifyTrack[] }) {
    if (!input.tracks.length) return { kind: 'empty' as const };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          const [device, existing] = await Promise.all([
            tx.device.findFirst({ where: { id: input.deviceId, isActive: true }, select: { id: true } }),
            tx.queueItem.findFirst({ where: { deviceId: input.deviceId, status: 'pending', queueReason: { in: ['user', 'admin', 'autoplay'] } }, select: { id: true } }),
          ]);
          const credential = await tx.kioskCredential.findUnique({ where: { deviceId: input.deviceId }, select: { credentialHash: true, expiresAt: true, revokedAt: true } });
          const now = new Date();
          if (!device || !credential || credential.revokedAt || credential.expiresAt <= now || !kioskSecretMatches(credential.credentialHash, input.credential)) return { kind: 'unauthorized' as const };
          if (existing) return { kind: 'already_queued' as const };
          let tracks = [...input.tracks];
          if (input.radioProfileId) {
            const stats = await tx.radioProfilePlaylistStat.findMany({ where: { radioProfileId: input.radioProfileId, spotifyUri: { in: tracks.map((track) => track.spotify_uri) } }, select: { spotifyUri: true, playCount: true } });
            const plays = new Map(stats.map((stat) => [stat.spotifyUri, stat.playCount]));
            tracks.sort((a, b) => (plays.get(a.spotify_uri) ?? 0) - (plays.get(b.spotify_uri) ?? 0));
            const leastPlayed = plays.get(tracks[0]!.spotify_uri) ?? 0;
            tracks = tracks.filter((track) => (plays.get(track.spotify_uri) ?? 0) === leastPlayed);
          }
          const track = tracks[Math.floor(Math.random() * tracks.length)]!;
          const song = await tx.song.upsert({
            where: { spotifyUri: track.spotify_uri },
            create: { spotifyUri: track.spotify_uri, spotifyId: track.spotify_id, title: track.title.slice(0, 200), artist: track.artist.slice(0, 200), artistId: track.artist_id || null, album: track.album?.slice(0, 200) || null, coverUrl: track.cover_url?.slice(0, 500) || null, durationMs: track.duration_ms, isExplicit: track.explicit, sourceType: 'spotify', visibility: 'public', assetRole: 'music' },
            update: { spotifyId: track.spotify_id, title: track.title.slice(0, 200), artist: track.artist.slice(0, 200), artistId: track.artist_id || null, album: track.album?.slice(0, 200) || null, coverUrl: track.cover_url?.slice(0, 500) || null, durationMs: track.duration_ms, isExplicit: track.explicit },
            select: { id: true },
          });
          const systemUser = await tx.user.upsert({
            where: { email: 'system@radiotedu.com' },
            create: { email: 'system@radiotedu.com', displayName: 'Radio TEDU', role: 'user', isGuest: false },
            update: {},
            select: { id: true },
          });
          await tx.queueItem.create({ data: { deviceId: input.deviceId, songId: song.id, addedBy: systemUser.id, queueReason: 'autoplay', autoplayRadioProfileId: input.radioProfileId, status: 'pending', priorityScore: 0 } });
          if (input.radioProfileId) await tx.radioProfilePlaylistStat.upsert({
            where: { radioProfileId_spotifyUri: { radioProfileId: input.radioProfileId, spotifyUri: track.spotify_uri } },
            create: { radioProfileId: input.radioProfileId, spotifyUri: track.spotify_uri, playCount: 0 },
            update: {},
          });
          return { kind: 'queued' as const, title: track.title };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
        if (!retryable || attempt === 2) throw error;
      }
    }
    return { kind: 'already_queued' as const };
  }

  async enqueueLocalAutoplay(input: { deviceId: string; credential: string; radioProfileId: string | null }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          const [device, existing, credential] = await Promise.all([
            tx.device.findFirst({ where: { id: input.deviceId, isActive: true }, select: { id: true } }),
            tx.queueItem.findFirst({ where: { deviceId: input.deviceId, status: 'pending' }, select: { id: true } }),
            tx.kioskCredential.findUnique({ where: { deviceId: input.deviceId }, select: { credentialHash: true, expiresAt: true, revokedAt: true } }),
          ]);
          const now = new Date();
          if (!device || !credential || credential.revokedAt || credential.expiresAt <= now || !kioskSecretMatches(credential.credentialHash, input.credential)) return { kind: 'unauthorized' as const };
          if (existing) return { kind: 'already_queued' as const };
          const candidate = await tx.song.findFirst({
            where: {
              sourceType: 'local', visibility: 'public', fileUrl: { not: null },
              AND: [
                { assetRole: 'music' },
                { OR: [{ isActive: true }, { isActive: null }] },
                { OR: [{ isBlocked: false }, { isBlocked: null }] },
                { OR: [{ isExplicit: false }, { isExplicit: null }] },
              ],
            },
            select: { id: true, title: true },
            orderBy: [{ lastPlayedAt: 'asc' }, { playCount: 'asc' }, { createdAt: 'asc' }],
          });
          if (!candidate) return { kind: 'empty' as const };
          const systemUser = await tx.user.upsert({
            where: { email: 'system@radiotedu.com' },
            create: { email: 'system@radiotedu.com', displayName: 'Radio TEDU', role: 'user', isGuest: false },
            update: {}, select: { id: true },
          });
          await tx.queueItem.create({ data: { deviceId: input.deviceId, songId: candidate.id, addedBy: systemUser.id, queueReason: 'autoplay', autoplayRadioProfileId: input.radioProfileId, status: 'pending', priorityScore: 0 } });
          return { kind: 'queued' as const, title: candidate.title };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
        if (!retryable || attempt === 2) throw error;
      }
    }
    return { kind: 'already_queued' as const };
  }

  async addSong(input: { deviceId: string; userId: string; songId?: string; spotifyTrack?: import('../../integrations/spotify/ports/spotify-catalog.port.js').SpotifyTrack; guestFingerprint?: string }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          const [device, session, user] = await Promise.all([
            tx.device.findFirst({ where: { id: input.deviceId, isActive: true }, select: { id: true } }),
            tx.deviceSession.findUnique({ where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } }, select: { id: true } }),
            tx.user.findUnique({ where: { id: input.userId }, select: { role: true, isGuest: true, totalSongsAdded: true, rankScore: true } }),
          ]);
          if (!device) return { kind: 'not_found' as const };
          if (!session || !user) return { kind: 'forbidden' as const };
          const isGuest = user.isGuest === true || user.role?.toLowerCase() === 'guest';
          const admin = user.role?.toUpperCase() === 'ADMIN';
          const todayParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
          const todayValues = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
          const todayKey = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
          const dayKey = new Date(`${todayKey}T00:00:00.000Z`);
          const fingerprint = input.guestFingerprint?.trim().slice(0, 255);
          if (isGuest && !fingerprint) return { kind: 'fingerprint_required' as const };
          if (isGuest && fingerprint) {
            const usage = await tx.guestDailySongLimit.findUnique({ where: { fingerprint_dayKey: { fingerprint, dayKey } }, select: { songsAdded: true } });
            if ((usage?.songsAdded ?? 0) >= 1) return { kind: 'guest_limit' as const };
          }

          let songId = input.songId;
          if (input.spotifyTrack) {
            const track = input.spotifyTrack;
            const song = await tx.song.upsert({
              where: { spotifyUri: track.spotify_uri },
              create: { spotifyUri: track.spotify_uri, spotifyId: track.spotify_id, title: track.title.slice(0, 200), artist: track.artist.slice(0, 200), artistId: track.artist_id || null, album: track.album?.slice(0, 200) || null, coverUrl: track.cover_url?.slice(0, 500) || null, durationMs: track.duration_ms, isExplicit: track.explicit, sourceType: 'spotify', visibility: 'public', assetRole: 'music' },
              update: { spotifyId: track.spotify_id, title: track.title.slice(0, 200), artist: track.artist.slice(0, 200), artistId: track.artist_id || null, album: track.album?.slice(0, 200) || null, coverUrl: track.cover_url?.slice(0, 500) || null, durationMs: track.duration_ms, isExplicit: track.explicit },
              select: { id: true },
            });
            songId = song.id;
          }
          if (!songId) return { kind: 'not_found' as const };
          const song = await tx.song.findUnique({ where: { id: songId }, select: { id: true, title: true, artist: true, artistId: true, spotifyId: true, visibility: true, assetRole: true, sourceType: true, isActive: true, isBlocked: true, isExplicit: true } });
          if (!song || song.isActive === false || song.isBlocked === true || song.isExplicit === true) return { kind: 'moderated' as const };
          if (!admin && (song.visibility !== 'public' || song.assetRole !== 'music')) return { kind: 'forbidden' as const };

          const [blockedArtist, keywords] = await Promise.all([
            tx.blockedArtist.findFirst({ where: { OR: [
              ...(song.artistId ? [{ spotifyArtistId: song.artistId }] : []),
              { artistName: { equals: song.artist, mode: 'insensitive' } },
            ] }, select: { id: true } }),
            tx.blockedKeyword.findMany({ select: { word: true } }),
          ]);
          const songText = `${song.title} ${song.artist}`.toLocaleLowerCase('tr-TR');
          if (blockedArtist || keywords.some(({ word }) => word && songText.includes(word.trim().toLocaleLowerCase('tr-TR')))) return { kind: 'moderated' as const };

          const [userPending, duplicate, recentlyPlayed] = await Promise.all([
            tx.queueItem.count({ where: { deviceId: input.deviceId, addedBy: input.userId, status: 'pending' } }),
            tx.queueItem.findFirst({ where: { deviceId: input.deviceId, songId, status: 'pending' }, select: { id: true } }),
            tx.queueItem.findFirst({ where: { deviceId: input.deviceId, songId, status: 'played', playedAt: { gt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } }),
          ]);
          if (!admin && userPending >= 5) return { kind: 'user_limit' as const };
          if (!admin && duplicate) return { kind: 'duplicate' as const };
          if (!admin && recentlyPlayed) return { kind: 'recently_played' as const };

          const item = await tx.queueItem.create({ data: { deviceId: input.deviceId, songId, addedBy: input.userId, queueReason: 'user', status: 'pending', priorityScore: 0 }, select: { id: true, status: true } });
          await tx.user.update({ where: { id: input.userId }, data: { totalSongsAdded: (user.totalSongsAdded ?? 0) + 1, ...(isGuest ? {} : { rankScore: (user.rankScore ?? 0) + 2 }) } });
          if (isGuest && fingerprint) await tx.guestDailySongLimit.upsert({
            where: { fingerprint_dayKey: { fingerprint, dayKey } },
            create: { fingerprint, dayKey, songsAdded: 1 },
            update: { songsAdded: { increment: 1 } },
          });
          return { kind: 'created' as const, id: item.id, status: item.status ?? 'pending' };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2034' || error.code === 'P2002');
        if (!retryable || attempt === 2) throw error;
      }
    }
    return { kind: 'forbidden' as const };
  }

  async vote(input: { userId: string; deviceId: string; queueItemId?: string; songId?: string; vote: -1 | 1; isSuper?: boolean }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          const [device, session, user] = await Promise.all([
            tx.device.findFirst({ where: { id: input.deviceId, isActive: true }, select: { id: true } }),
            tx.deviceSession.findUnique({ where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } }, select: { id: true } }),
            tx.user.findUnique({ where: { id: input.userId }, select: { id: true, isGuest: true, role: true, lastSuperVoteAt: true } }),
          ]);
          if (!device || !session || !user) return { kind: 'forbidden' as const };
          const isGuest = user.isGuest === true || user.role?.toLowerCase() === 'guest';
          if (input.isSuper && isGuest) return { kind: 'supervote_guest' as const };
          const targetId = input.queueItemId;
          const directSong = !targetId && input.songId ? await tx.song.findUnique({ where: { id: input.songId }, select: { id: true, isActive: true, isBlocked: true } }) : null;
          const item = targetId ? await tx.queueItem.findFirst({ where: { id: targetId, deviceId: input.deviceId }, select: { id: true, deviceId: true, songId: true, status: true, addedBy: true } }) : null;
          if ((!targetId && !input.songId) || (targetId && !item) || (!targetId && (!directSong || directSong.isActive === false || directSong.isBlocked === true))) return { kind: 'not_found' as const };
          const voteTime = new Date();
          if (input.isSuper) {
            const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(voteTime);
            const startOfDay = new Date(`${dateKey}T00:00:00+03:00`);
            const claimed = await tx.user.updateMany({ where: { id: input.userId, isGuest: false, OR: [{ lastSuperVoteAt: null }, { lastSuperVoteAt: { lt: startOfDay } }] }, data: { lastSuperVoteAt: voteTime } });
            if (claimed.count !== 1) return { kind: 'supervote_used' as const };
          }

          if (!targetId && directSong) {
            const requestedValue = input.isSuper ? 3 : input.vote;
            await tx.song.update({ where: { id: directSong.id }, data: { score: { increment: requestedValue } } });
            return { kind: 'direct' as const, scoreDelta: requestedValue };
          }
          if (!targetId || !item) return { kind: 'not_found' as const };
          const previous = await tx.vote.findUnique({ where: { queueItemId_userId: { queueItemId: targetId, userId: input.userId } }, select: { voteType: true } });
          const previousValue = previous?.voteType === 4 ? 3 : previous?.voteType ?? 0;
          const requestedValue = input.isSuper ? 3 : input.vote;
          const nextValue = input.isSuper ? 3 : (previousValue === requestedValue ? 0 : requestedValue);
          if (nextValue === 0) await tx.vote.deleteMany({ where: { queueItemId: targetId, userId: input.userId } });
          else await tx.vote.upsert({ where: { queueItemId_userId: { queueItemId: targetId, userId: input.userId } }, create: { queueItemId: targetId, userId: input.userId, voteType: nextValue }, update: { voteType: nextValue } });
          const votes = await tx.vote.findMany({ where: { queueItemId: targetId }, select: { voteType: true } });
          const upvotes = votes.reduce((sum, vote) => sum + Math.max(vote.voteType, 0), 0);
          const downvotes = votes.reduce((sum, vote) => sum + Math.abs(Math.min(vote.voteType, 0)), 0);
          const score = upvotes - downvotes;
          const scoreDelta = nextValue - previousValue;
          const rankByVote = (value: number) => value === 3 || value === 4 ? 2 : value;
          const rankDelta = rankByVote(nextValue) - rankByVote(previousValue);
          await tx.song.update({ where: { id: item.songId }, data: { score: { increment: scoreDelta } } });
          if (rankDelta) {
            const requester = await tx.user.findUnique({ where: { id: item.addedBy }, select: { rankScore: true, isGuest: true } });
            if (requester && !requester.isGuest) await tx.user.update({ where: { id: item.addedBy }, data: { rankScore: (requester.rankScore ?? 0) + rankDelta } });
          }
          const skipped = score <= -5;
          await tx.queueItem.update({ where: { id: item.id }, data: { upvotes, downvotes, priorityScore: score, ...(skipped ? { status: 'skipped' } : {}) } });
          if (skipped && item.status === 'playing') await tx.device.update({ where: { id: item.deviceId }, data: { currentSongId: null } });
          return { kind: 'voted' as const, upvotes, downvotes, score, deviceId: item.deviceId, userVote: nextValue, skipped, playing: item.status === 'playing' };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2034' || error.code === 'P2002');
        if (!retryable || attempt === 2) throw error;
      }
    }
    return { kind: 'forbidden' as const };
  }
}
