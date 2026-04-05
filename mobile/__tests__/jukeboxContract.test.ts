import { describe, expect, it } from '@jest/globals';
import {
  buildQueueSongSelectionPayload,
  canUseSupervoteToday,
  getCatalogSongKey,
} from '../src/services/jukeboxContract';

describe('mobile jukebox contract', () => {
  it('builds a spotify queue payload from spotify_uri instead of song_id', () => {
    expect(
      buildQueueSongSelectionPayload({
        id: null,
        source_type: 'spotify',
        spotify_uri: 'spotify:track:abc123',
      })
    ).toEqual({
      spotify_uri: 'spotify:track:abc123',
    });
  });

  it('builds a local queue payload from song_id', () => {
    expect(
      buildQueueSongSelectionPayload({
        id: 'song-local-1',
        source_type: 'local',
      })
    ).toEqual({
      song_id: 'song-local-1',
    });
  });

  it('uses spotify_uri as the stable catalog key when spotify ids are null', () => {
    expect(
      getCatalogSongKey({
        id: null,
        source_type: 'spotify',
        spotify_uri: 'spotify:track:xyz789',
        title: 'Track',
        artist: 'Artist',
      })
    ).toBe('spotify:spotify:track:xyz789');
  });

  it('blocks supervote reuse on the same Istanbul day', () => {
    expect(
      canUseSupervoteToday({
        isGuest: false,
        lastSuperVoteAt: '2026-04-05T08:00:00.000Z',
        now: new Date('2026-04-05T18:30:00.000Z'),
      })
    ).toBe(false);
  });
});
