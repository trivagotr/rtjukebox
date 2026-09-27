import type { RadioProfilesRepository } from './ports/radio-profiles.repository.js';

export class RadioProfilesService {
  constructor(private readonly repository: RadioProfilesRepository) {}
  list() { return this.repository.list(); }
  get(id: string) { return this.repository.get(id); }
  create(input: Record<string, unknown>) { return this.repository.create(input); }
  update(id: string, input: Record<string, unknown>) { return this.repository.update(id, input); }
  delete(id: string) { return this.repository.delete(id); }
  attachAsset(profileId: string, input: { songId: string; slotType: 'jingle' | 'ad'; sortOrder?: number | null }) { return this.repository.attachAsset(profileId, input); }
  detachAsset(profileId: string, songId: string, slotType: 'jingle' | 'ad') { return this.repository.detachAsset(profileId, songId, slotType); }
  assignDevice(deviceId: string, profileId: string | null) { return this.repository.assignDevice(deviceId, profileId); }
  updateDeviceOverride(deviceId: string, input: Record<string, unknown>) { return this.repository.updateDeviceOverride(deviceId, input); }
}
