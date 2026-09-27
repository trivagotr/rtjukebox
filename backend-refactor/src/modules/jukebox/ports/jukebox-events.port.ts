export interface JukeboxEvents {
  queueUpdated(deviceId: string, state: unknown): void;
  songSkipped(deviceId: string, queueItemId: string): void;
  songRejected(deviceId: string, queueItemId: string): void;
  forceLogout(deviceId: string): void;
  kioskHeartbeat(deviceId: string, timestamp: number): void;
  playbackProgress(deviceId: string, progress: { currentTime: number; duration: number; percent: number }): void;
}

export const noJukeboxEvents: JukeboxEvents = {
  queueUpdated: () => undefined,
  songSkipped: () => undefined,
  songRejected: () => undefined,
  forceLogout: () => undefined,
  kioskHeartbeat: () => undefined,
  playbackProgress: () => undefined,
};
