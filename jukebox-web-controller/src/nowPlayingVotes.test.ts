import { describe, expect, it } from 'vitest';
import {
  getDisplayedSongScore,
  hasSupervoteAvailableToday,
  isSupervoteActive,
  resolveDisplayedVote,
} from './nowPlayingVotes';

describe('now playing vote helpers', () => {
  it('prefers optimistic local votes over the server user_vote for now-playing items', () => {
    expect(
      resolveDisplayedVote(
        { id: 'queue-1', user_vote: 1 },
        { 'queue-1': -1 },
      ),
    ).toBe(-1);

    expect(
      resolveDisplayedVote(
        { id: 'queue-2', user_vote: 3 },
        {},
      ),
    ).toBe(3);
  });

  it('reads the visible song score from song_score first and priority_score as fallback', () => {
    expect(getDisplayedSongScore({ song_score: -5, priority_score: 99 })).toBe(-5);
    expect(getDisplayedSongScore({ priority_score: 4 })).toBe(4);
    expect(getDisplayedSongScore({})).toBe(0);
  });

  it('keeps the daily supervote availability rule aligned with Istanbul day boundaries', () => {
    expect(hasSupervoteAvailableToday()).toBe(true);
    expect(hasSupervoteAvailableToday('2026-04-05T02:00:00.000Z')).toBe(false);
    expect(hasSupervoteAvailableToday('2026-04-04T20:00:00.000Z')).toBe(true);
  });

  it('treats stored supervote values as active in the UI', () => {
    expect(isSupervoteActive(3)).toBe(true);
    expect(isSupervoteActive(4)).toBe(true);
    expect(isSupervoteActive(1)).toBe(false);
  });
});
