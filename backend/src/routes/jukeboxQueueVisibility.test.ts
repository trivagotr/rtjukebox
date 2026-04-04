import { describe, expect, it } from 'vitest';
import { buildVisibleQueueState } from './jukebox';

describe('jukebox queue visibility', () => {
  it('keeps user, admin, and autoplay items visible in the queue list', () => {
    const state = buildVisibleQueueState([
      { id: 'q1', status: 'pending', queue_reason: 'user', song_id: 'song-1' },
      { id: 'q2', status: 'pending', queue_reason: 'admin', song_id: 'song-2' },
      { id: 'q3', status: 'pending', queue_reason: 'autoplay', song_id: 'song-3' },
    ]);

    expect(state.queue.map((item) => item.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('hides jingle and ad items from the visible queue list', () => {
    const state = buildVisibleQueueState([
      { id: 'q1', status: 'pending', queue_reason: 'user', song_id: 'song-1' },
      { id: 'q2', status: 'pending', queue_reason: 'jingle', song_id: 'song-2' },
      { id: 'q3', status: 'pending', queue_reason: 'ad', song_id: 'song-3' },
    ]);

    expect(state.queue.map((item) => item.id)).toEqual(['q1']);
  });

  it('preserves now-playing correctness even when a hidden system item is playing', () => {
    const state = buildVisibleQueueState([
      { id: 'q-hidden', status: 'playing', queue_reason: 'jingle', song_id: 'song-jingle' },
      { id: 'q-user', status: 'pending', queue_reason: 'user', song_id: 'song-user' },
    ]);

    expect(state.now_playing).toMatchObject({
      id: 'q-hidden',
      queue_reason: 'jingle',
      status: 'playing',
    });
    expect(state.queue.map((item) => item.id)).toEqual(['q-user']);
  });
});
