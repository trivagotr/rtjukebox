import type { RegisteredDevice } from './ports/device.repository.js';

export function toRegisteredDeviceDto(device: RegisteredDevice) {
  return {
    id: device.id,
    device_code: device.device_code,
    name: device.name,
    location: device.location,
    is_active: device.is_active,
    current_song_id: device.current_song_id,
    last_heartbeat: device.last_heartbeat,
    created_at: device.created_at,
  };
}
