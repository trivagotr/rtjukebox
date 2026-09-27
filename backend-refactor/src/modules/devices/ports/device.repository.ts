export interface PublicDevice {
  id: string;
  device_code: string;
  name: string;
  location: string | null;
}

export interface RegisteredDevice extends PublicDevice {
  is_active: boolean;
  current_song_id: string | null;
  last_heartbeat: Date | null;
  created_at: Date;
}

export type KioskRegistrationResult =
  | { kind: 'registered'; device: RegisteredDevice }
  | { kind: 'invalid_credential' | 'invalid_provisioning_code' | 'inactive' | 'not_found' };

export interface DeviceRepository {
  listPublicDevices(): Promise<PublicDevice[]>;
  issueKioskProvisioningCode(deviceId: string, createdBy: string, codeHash: string): Promise<{ kind: 'created'; expiresAt: Date } | { kind: 'not_found' | 'inactive' }>;
  registerKiosk(input: { deviceCode: string; credential?: string; provisioningCode?: string; newCredential: string; newCredentialHash: string }): Promise<KioskRegistrationResult>;
  listAdminDevices(): Promise<unknown[]>;
  createAdminDevice(input: { deviceCode: string; name: string; location: string | null; password: string }): Promise<unknown>;
  updateAdminDevice(id: string, input: { name?: string | null; location?: string | null; isActive?: boolean; password?: string; playlistUri?: string | null; overrideEnabled?: boolean }): Promise<unknown | null>;
  logoutAllDeviceSessions(id: string): Promise<boolean>;
  updateSpotifyPlaybackTarget(id: string, input: { deviceId: string | null; playerName: string | null }): Promise<unknown | null>;
}
