import type { SpotifyTrack } from '../../integrations/spotify/ports/spotify-catalog.port.js';
import type { CatalogModerationSnapshot } from '../ports/catalog.repository.js';

export interface ModerationPolicy {
  isAllowed(track: SpotifyTrack, snapshot: CatalogModerationSnapshot): boolean;
}

export class SpotifyExplicitPolicy implements ModerationPolicy {
  isAllowed(track: SpotifyTrack) {
    return !track.explicit;
  }
}

export class CatalogBlocklistPolicy implements ModerationPolicy {
  isAllowed(track: SpotifyTrack, snapshot: CatalogModerationSnapshot) {
    return !snapshot.blockedSpotifyIds.has(track.spotify_id)
      && !snapshot.blockedArtistIds.has(track.artist_id)
      && !snapshot.blockedArtistNames.has(track.artist.trim().toLocaleLowerCase('tr-TR'));
  }
}

export class CatalogKeywordPolicy implements ModerationPolicy {
  isAllowed(track: SpotifyTrack, snapshot: CatalogModerationSnapshot) {
    const text = `${track.title} ${track.artist}`.toLocaleLowerCase('tr-TR');
    return !snapshot.blockedKeywords.some((keyword) => text.includes(keyword));
  }
}
