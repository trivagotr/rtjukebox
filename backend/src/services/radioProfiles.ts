import { db } from '../db';

export const RADIO_PROFILE_ASSET_SLOT_TYPES = ['jingle', 'ad'] as const;

export type RadioProfileAssetSlotType = (typeof RADIO_PROFILE_ASSET_SLOT_TYPES)[number];

export interface RadioProfileConfig {
  id: string;
  autoplaySpotifyPlaylistUri: string | null;
  jingleEveryNSongs: number | null;
  adBreakIntervalMinutes: number | null;
}

export interface DeviceRadioProfileOverrides {
  radioProfileId: string | null;
  overrideEnabled: boolean;
  overrideAutoplaySpotifyPlaylistUri?: string | null;
  overrideJingleEveryNSongs?: number | null;
  overrideAdBreakIntervalMinutes?: number | null;
}

export interface EffectiveRadioProfileConfig {
  radioProfileId: string | null;
  autoplaySpotifyPlaylistUri: string | null;
  jingleEveryNSongs: number | null;
  adBreakIntervalMinutes: number | null;
  overrideEnabled: boolean;
  lastAdBreakAt?: Date | null;
}

type PoolSongReference = {
  id: string;
};

type QueueReason = 'autoplay' | 'jingle' | 'ad';

export type SystemQueueInsertion = {
  songId: string;
  queueReason: Exclude<QueueReason, 'autoplay'>;
};

type AutoplayTrackReference = {
  spotify_uri: string;
  title: string;
};

type AutoplayTrackStatReference = {
  spotify_uri: string;
  play_count?: number | null;
  last_played_at?: Date | string | null;
};

type RadioProfileDbClient = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
};

function resolveOverride<T>(
  overrideEnabled: boolean,
  overrideValue: T | null | undefined,
  fallbackValue: T | null,
): T | null {
  if (!overrideEnabled) {
    return fallbackValue;
  }

  return overrideValue ?? fallbackValue;
}

export function resolveEffectiveRadioProfileConfig(params: {
  profile: RadioProfileConfig | null;
  device: DeviceRadioProfileOverrides;
}): EffectiveRadioProfileConfig {
  const { profile, device } = params;

  return {
    radioProfileId: device.radioProfileId ?? profile?.id ?? null,
    autoplaySpotifyPlaylistUri: resolveOverride(
      device.overrideEnabled,
      device.overrideAutoplaySpotifyPlaylistUri,
      profile?.autoplaySpotifyPlaylistUri ?? null,
    ),
    jingleEveryNSongs: resolveOverride(
      device.overrideEnabled,
      device.overrideJingleEveryNSongs,
      profile?.jingleEveryNSongs ?? null,
    ),
    adBreakIntervalMinutes: resolveOverride(
      device.overrideEnabled,
      device.overrideAdBreakIntervalMinutes,
      profile?.adBreakIntervalMinutes ?? null,
    ),
    overrideEnabled: device.overrideEnabled,
  };
}

export async function loadEffectiveRadioProfileConfig(params: {
  deviceId: string;
  dbClient?: RadioProfileDbClient;
}): Promise<EffectiveRadioProfileConfig | null> {
  const dbClient = params.dbClient ?? db;
  const result = await dbClient.query(
    `SELECT d.radio_profile_id,
            d.override_enabled,
            d.override_autoplay_spotify_playlist_uri,
            d.override_jingle_every_n_songs,
            d.override_ad_break_interval_minutes,
            d.last_ad_break_at,
            rp.id AS profile_id,
            rp.autoplay_spotify_playlist_uri,
            rp.jingle_every_n_songs,
            rp.ad_break_interval_minutes
     FROM devices d
     LEFT JOIN radio_profiles rp ON rp.id = d.radio_profile_id
     WHERE d.id = $1
     LIMIT 1`,
    [params.deviceId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...resolveEffectiveRadioProfileConfig({
      profile: row.profile_id
        ? {
            id: row.profile_id,
            autoplaySpotifyPlaylistUri: row.autoplay_spotify_playlist_uri,
            jingleEveryNSongs: row.jingle_every_n_songs,
            adBreakIntervalMinutes: row.ad_break_interval_minutes,
          }
        : null,
      device: {
        radioProfileId: row.radio_profile_id,
        overrideEnabled: row.override_enabled,
        overrideAutoplaySpotifyPlaylistUri: row.override_autoplay_spotify_playlist_uri,
        overrideJingleEveryNSongs: row.override_jingle_every_n_songs,
        overrideAdBreakIntervalMinutes: row.override_ad_break_interval_minutes,
      },
    }),
    lastAdBreakAt: row.last_ad_break_at ?? null,
  };
}

function pickRandomItem<T>(items: T[], random: () => number): T | null {
  if (items.length === 0) {
    return null;
  }

  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] ?? null;
}

function buildAutoplayStatsMap(autoplayStats?: AutoplayTrackStatReference[]) {
  const statsMap = new Map<string, number>();

  for (const stat of autoplayStats ?? []) {
    const playCount = typeof stat.play_count === 'number' && Number.isFinite(stat.play_count)
      ? stat.play_count
      : 0;
    statsMap.set(stat.spotify_uri, playCount);
  }

  return statsMap;
}

function pickLeastPlayedTrack<T extends AutoplayTrackReference>(params: {
  tracks: T[];
  autoplayStats?: AutoplayTrackStatReference[];
  random: () => number;
}): T | null {
  if (params.tracks.length === 0) {
    return null;
  }

  const statsMap = buildAutoplayStatsMap(params.autoplayStats);
  let minPlayCount = Number.POSITIVE_INFINITY;
  const rankedTracks: Array<{ track: T; playCount: number }> = [];

  for (const track of params.tracks) {
    const playCount = statsMap.get(track.spotify_uri) ?? 0;
    rankedTracks.push({ track, playCount });
    if (playCount < minPlayCount) {
      minPlayCount = playCount;
    }
  }

  const leastPlayedTracks = rankedTracks
    .filter((entry) => entry.playCount === minPlayCount)
    .map((entry) => entry.track);

  return pickRandomItem(leastPlayedTracks, params.random);
}

function shouldRunAdBreak(params: {
  adBreakIntervalMinutes: number | null;
  lastAdBreakAt: Date | null | undefined;
  now: Date;
}) {
  if (!params.adBreakIntervalMinutes || params.adBreakIntervalMinutes <= 0) {
    return false;
  }

  if (!params.lastAdBreakAt) {
    return true;
  }

  return params.now.getTime() - params.lastAdBreakAt.getTime() >= params.adBreakIntervalMinutes * 60_000;
}

function shouldQueueJingle(params: {
  jingleEveryNSongs: number | null;
  completedMusicCount: number;
}) {
  if (!params.jingleEveryNSongs || params.jingleEveryNSongs <= 0) {
    return false;
  }

  return params.completedMusicCount > 0 && params.completedMusicCount % params.jingleEveryNSongs === 0;
}

export function buildSystemQueueInsertions(params: {
  effectiveConfig: EffectiveRadioProfileConfig;
  completedNormalMusicItem: boolean;
  completedMusicCount: number;
  now: Date;
  jinglePool: PoolSongReference[];
  adPool: PoolSongReference[];
  random?: () => number;
}): SystemQueueInsertion[] {
  const random = params.random ?? Math.random;

  if (
    shouldRunAdBreak({
      adBreakIntervalMinutes: params.effectiveConfig.adBreakIntervalMinutes,
      lastAdBreakAt: params.effectiveConfig.lastAdBreakAt,
      now: params.now,
    })
  ) {
    return params.adPool.map((song) => ({
      songId: song.id,
      queueReason: 'ad',
    }));
  }

  if (
    shouldQueueJingle({
      jingleEveryNSongs: params.effectiveConfig.jingleEveryNSongs,
      completedMusicCount: params.completedMusicCount,
    })
    && params.completedNormalMusicItem
  ) {
    const selectedJingle = pickRandomItem(params.jinglePool, random);
    return selectedJingle
      ? [
          {
            songId: selectedJingle.id,
            queueReason: 'jingle',
          },
        ]
      : [];
  }

  return [];
}

export function buildAutoplaySelection<T extends AutoplayTrackReference>(params: {
  playlistUri: string | null;
  tracks: T[];
  autoplayStats?: AutoplayTrackStatReference[];
  random?: () => number;
}): { queueReason: 'autoplay'; track: T } | null {
  if (!params.playlistUri) {
    return null;
  }

  const random = params.random ?? Math.random;
  const selectedTrack = pickLeastPlayedTrack({
    tracks: params.tracks,
    autoplayStats: params.autoplayStats,
    random,
  });

  if (!selectedTrack) {
    return null;
  }

  return {
    queueReason: 'autoplay',
    track: selectedTrack,
  };
}
