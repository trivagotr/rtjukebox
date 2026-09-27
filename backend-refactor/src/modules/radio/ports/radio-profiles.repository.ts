export interface RadioProfilesRepository {
  list(): Promise<unknown[]>;
  get(id: string): Promise<unknown | null>;
  create(input: Record<string, unknown>): Promise<unknown>;
  update(id: string, input: Record<string, unknown>): Promise<unknown | null>;
  delete(id: string): Promise<boolean>;
  attachAsset(profileId: string, input: { songId: string; slotType: 'jingle' | 'ad'; sortOrder?: number | null }): Promise<unknown | null>;
  detachAsset(profileId: string, songId: string, slotType: 'jingle' | 'ad'): Promise<boolean>;
  assignDevice(deviceId: string, profileId: string | null): Promise<unknown | null>;
  updateDeviceOverride(deviceId: string, input: Record<string, unknown>): Promise<unknown | null>;
}
