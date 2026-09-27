import type { Server } from 'socket.io';
import type { JukeboxEvents } from '../ports/jukebox-events.port.js';

export class SocketIoJukeboxEvents implements JukeboxEvents {
  private io: Server | null = null;

  attach(io: Server) { this.io = io; }
  queueUpdated(deviceId: string, state: unknown) { this.io?.to(`device:${deviceId}`).emit('queue_updated', state); }
  songSkipped(deviceId: string, _queueItemId: string) { this.io?.to(`device:${deviceId}`).emit('song_skipped'); }
  songRejected(deviceId: string, _queueItemId: string) { this.io?.to(`device:${deviceId}`).emit('song_rejected'); }
  forceLogout(deviceId: string) { this.io?.to(`device:${deviceId}`).emit('force_logout'); }
  kioskHeartbeat(deviceId: string, timestamp: number) { this.io?.to(`device:${deviceId}`).emit('kiosk_heartbeat', { device_id: deviceId, timestamp }); }
  playbackProgress(deviceId: string, progress: { currentTime: number; duration: number; percent: number }) { this.io?.to(`device:${deviceId}`).emit('playback_progress', { device_id: deviceId, ...progress }); }
}
