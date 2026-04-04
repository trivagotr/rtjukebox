export interface CatalogSearchSong {
  id: string | null;
  source_type?: 'spotify' | 'local';
  spotify_uri?: string | null;
  title: string;
  artist: string;
  cover_url: string | null;
  file_url: string | null;
}

export function getSearchResultKey(song: CatalogSearchSong, index: number): string {
  return song.id
    ?? song.spotify_uri
    ?? `${song.source_type ?? 'unknown'}:${song.title}:${song.artist}:${index}`;
}

export function buildQueueRequestPayload(deviceId: string, song: CatalogSearchSong) {
  if (song.source_type === 'spotify' && song.spotify_uri) {
    return {
      device_id: deviceId,
      spotify_uri: song.spotify_uri,
    };
  }

  if (!song.id) {
    throw new Error('Selected song is missing both song_id and spotify_uri');
  }

  return {
    device_id: deviceId,
    song_id: song.id,
  };
}
