type CatalogSongLike = {
  id?: string | null;
  source_type?: 'spotify' | 'local' | null;
  spotify_uri?: string | null;
  title?: string | null;
  artist?: string | null;
};

const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';

function getIstanbulDayKey(input: Date | string | number) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value ?? '0000';
  const month = parts.find(part => part.type === 'month')?.value ?? '01';
  const day = parts.find(part => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

export function buildQueueSongSelectionPayload(song: CatalogSongLike) {
  if (song.source_type === 'spotify' && song.spotify_uri) {
    return { spotify_uri: song.spotify_uri };
  }

  if (song.id) {
    return { song_id: song.id };
  }

  throw new Error('Song selection requires song_id or spotify_uri');
}

export function getCatalogSongKey(song: CatalogSongLike) {
  if (song.source_type === 'spotify' && song.spotify_uri) {
    return `spotify:${song.spotify_uri}`;
  }

  if (song.id) {
    return `local:${song.id}`;
  }

  return `fallback:${song.title ?? 'unknown'}:${song.artist ?? 'unknown'}`;
}

export function canUseSupervoteToday(params: {
  isGuest: boolean;
  lastSuperVoteAt?: string | Date | null;
  now?: Date;
}) {
  if (params.isGuest) {
    return false;
  }

  if (!params.lastSuperVoteAt) {
    return true;
  }

  const now = params.now ?? new Date();
  return getIstanbulDayKey(params.lastSuperVoteAt) !== getIstanbulDayKey(now);
}
