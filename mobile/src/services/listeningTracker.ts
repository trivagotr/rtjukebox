/**
 * Measures listening minutes per channel/podcast and reports them to analytics
 * (which only emits if the user consented). Pure timing — no content captured.
 */
import TrackPlayer, {Event, State} from 'react-native-track-player';
import {Analytics} from './analyticsService';

let currentId: string | null = null;
let playStartMs: number | null = null;
let started = false;

function flush() {
  if (currentId && playStartMs != null) {
    const seconds = Math.round((Date.now() - playStartMs) / 1000);
    if (seconds >= 5) {
      Analytics.listen(currentId, seconds);
    }
  }
  playStartMs = null;
}

/** Register once at startup. Safe to call multiple times. */
export function startListeningTracker(): void {
  if (started) {
    return;
  }
  started = true;

  TrackPlayer.addEventListener(Event.PlaybackState, async ({state}) => {
    if (state === State.Playing) {
      const track = await TrackPlayer.getActiveTrack();
      currentId = track?.id ?? null;
      playStartMs = Date.now();
    } else {
      // paused / stopped / buffering ends an active listening interval
      flush();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
    flush();
    const track = await TrackPlayer.getActiveTrack();
    currentId = track?.id ?? null;
    const {state} = await TrackPlayer.getPlaybackState();
    playStartMs = state === State.Playing ? Date.now() : null;
  });
}
