import { describe, expect, it, vi } from 'vitest';
import adapterHelpers from './playback-adapters.js';

const {
  PLAYBACK_STATES,
  createPlaybackStateMachine,
  createPlaybackAdapter,
} = adapterHelpers;

describe('kiosk playback adapter helpers', () => {
  it('exposes the kiosk playback state machine states', () => {
    expect(Object.values(PLAYBACK_STATES)).toEqual([
      'BOOTING',
      'REGISTERING',
      'READY',
      'IDLE',
      'CLAIMING_NEXT',
      'PREPARING',
      'PLAYING',
      'PAUSED',
      'FINISHING',
      'FAILED',
      'RECOVERING',
      'OFFLINE',
    ]);
  });

  it('tracks state transitions and last error without leaking credentials', () => {
    const machine = createPlaybackStateMachine();

    machine.transition('REGISTERING');
    machine.transition('FAILED', { error: new Error('device_pwd=secret failed') });

    expect(machine.getState()).toEqual({
      state: 'FAILED',
      previousState: 'REGISTERING',
      error: 'device_pwd=[REDACTED] failed',
    });
  });

  it('creates spotify adapter when a spotify plan and helper are available', () => {
    const adapter = createPlaybackAdapter({
      plan: { kind: 'spotify', spotifyUri: 'spotify:track:123' },
      spotify: { play: vi.fn() },
      htmlAudio: { play: vi.fn() },
    });

    expect(adapter.name).toBe('spotify_web_playback');
  });

  it('falls back to html audio for local plans', () => {
    const adapter = createPlaybackAdapter({
      plan: { kind: 'local', audioUrl: 'https://example.test/song.mp3' },
      spotify: null,
      htmlAudio: { play: vi.fn() },
    });

    expect(adapter.name).toBe('html_audio');
  });
});
