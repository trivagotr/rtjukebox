import type { SpotifyCatalogProvider, SpotifyTrack } from '../integrations/spotify/ports/spotify-catalog.port.js';
import type { CatalogRepository } from './ports/catalog.repository.js';
import { CatalogBlocklistPolicy, CatalogKeywordPolicy, SpotifyExplicitPolicy, type ModerationPolicy } from './moderation/moderation-policy.js';
import { toLocalCatalogDto, toSpotifyCatalogDto } from './catalog.dto.js';

export class CatalogService {
  private readonly policies: ModerationPolicy[] = [
    new SpotifyExplicitPolicy(),
    new CatalogBlocklistPolicy(),
    new CatalogKeywordPolicy(),
  ];

  constructor(private readonly repository: CatalogRepository, private readonly spotify: SpotifyCatalogProvider) {}

  async listSongs(input: { search?: string; page: number }) {
    const limit = 20;
    const offset = (input.page - 1) * limit;
    const localSongs = await this.repository.listLocalSongs({ search: input.search, offset, limit });
    if (!input.search) return { items: localSongs.map(toLocalCatalogDto) };

    let tracks: SpotifyTrack[] = [];
    try {
      tracks = await this.spotify.searchTracks(input.search, 'TR', 10);
    } catch {
      // Preserve local catalog availability while Spotify is unavailable.
    }
    const snapshot = await this.repository.loadModerationSnapshot();
    const allowedTracks = tracks.filter((track) => this.policies.every((policy) => policy.isAllowed(track, snapshot)));
    return {
      items: [...allowedTracks.map(toSpotifyCatalogDto), ...localSongs.map(toLocalCatalogDto)],
    };
  }

  getTrackByUri(uri: string): Promise<SpotifyTrack> {
    return this.spotify.getTrackByUri(uri, 'TR');
  }

  async canQueueSpotifyTrack(track: SpotifyTrack) {
    const snapshot = await this.repository.loadModerationSnapshot();
    return this.policies.every((policy) => policy.isAllowed(track, snapshot));
  }
}
