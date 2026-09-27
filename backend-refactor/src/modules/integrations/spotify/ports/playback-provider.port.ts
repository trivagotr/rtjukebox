export interface PlaybackState {
  deviceId: string | null;
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  itemUri: string | null;
  trackName: string | null;
  artistName: string | null;
}

export interface PlaybackDevice {
  id: string;
  name: string;
  is_active: boolean;
  type: string;
  volume_percent: number | null;
}

export type TrackRef =
  | { provider: 'spotify'; uri: string }
  | { provider: 'local'; fileUrl: string };

export interface PlaybackProvider {
  play(deviceId: string, trackRef: TrackRef): Promise<void>;
  pause(deviceId: string): Promise<void>;
  getState(deviceId: string): Promise<PlaybackState | null>;
  listDevices(deviceId?: string): Promise<PlaybackDevice[]>;
}
