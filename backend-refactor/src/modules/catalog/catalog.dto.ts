import type { SpotifyTrack } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { LocalCatalogSong } from './ports/catalog.repository.js';

export function toSpotifyCatalogDto(track: SpotifyTrack) {
  return {
    id: null,
    source_type: 'spotify' as const,
    visibility: 'public' as const,
    asset_role: 'music' as const,
    spotify_uri: track.spotify_uri,
    spotify_id: track.spotify_id,
    title: track.title,
    artist: track.artist,
    artist_id: track.artist_id || null,
    album: track.album || null,
    cover_url: track.cover_url || null,
    duration_ms: track.duration_ms,
    is_explicit: track.explicit,
    is_blocked: false,
    file_url: null,
    play_count: 0,
  };
}

export function toLocalCatalogDto(song: LocalCatalogSong) {
  return {
    id: song.id,
    source_type: song.sourceType === 'spotify' ? 'spotify' as const : 'local' as const,
    visibility: song.visibility === 'hidden' ? 'hidden' as const : 'public' as const,
    asset_role: song.assetRole === 'jingle' || song.assetRole === 'ad' ? song.assetRole : 'music' as const,
    spotify_uri: song.spotifyUri,
    spotify_id: song.spotifyId,
    title: song.title,
    artist: song.artist,
    artist_id: song.artistId,
    album: song.album,
    cover_url: song.coverUrl,
    duration_ms: song.durationMs ?? (song.durationSeconds ? song.durationSeconds * 1000 : null),
    is_explicit: song.isExplicit ?? false,
    is_blocked: song.isBlocked ?? false,
    file_url: song.fileUrl,
    play_count: song.playCount ?? 0,
  };
}
