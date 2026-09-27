export interface SpotifyTrack {
  spotify_uri: string;
  spotify_id: string;
  title: string;
  artist: string;
  artist_id: string;
  album: string;
  cover_url: string;
  duration_ms: number;
  explicit: boolean;
  popularity: number;
}

export interface SpotifyCatalogProvider {
  searchTracks(query: string, market: string, limit: number): Promise<SpotifyTrack[]>;
  getTrackByUri(spotifyUri: string, market: string): Promise<SpotifyTrack>;
  getPlaylistPreview(playlistUriOrUrl: string, market: string): Promise<{ id: string; uri: string; name: string; description: string; cover_url: string | null; owner_name: string; total_tracks: number }>;
  getPlaylistTracks(playlistUriOrUrl: string, market: string, limit: number): Promise<SpotifyTrack[]>;
}
