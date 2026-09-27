import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/app-error.js';
import { generateKioskCredential, generateKioskProvisioningCode, hashKioskSecret } from '../../core/security/kiosk-credential.js';
import type { DeviceRepository } from './ports/device.repository.js';
import { noJukeboxEvents, type JukeboxEvents } from '../jukebox/ports/jukebox-events.port.js';

export class DevicesService {
  constructor(private readonly repository: DeviceRepository, private readonly events: JukeboxEvents = noJukeboxEvents) {}

  listPublicDevices() {
    return this.repository.listPublicDevices();
  }

  async registerKiosk(input: { device_code: string; credential?: string; provisioning_code?: string }) {
    const credential = input.credential ?? generateKioskCredential();
    const result = await this.repository.registerKiosk({
      deviceCode: input.device_code.trim().toUpperCase(),
      credential: input.credential,
      provisioningCode: input.provisioning_code,
      newCredential: credential,
      newCredentialHash: hashKioskSecret(credential),
    });

    if (result.kind === 'not_found') throw new NotFoundError('Device code invalid');
    if (result.kind === 'inactive') throw new ForbiddenError('Device is inactive; an administrator must activate it');
    if (result.kind === 'invalid_credential') throw new ForbiddenError('Kiosk credential is invalid, expired, or revoked');
    if (result.kind === 'invalid_provisioning_code') throw new ForbiddenError('Provisioning code is invalid, expired, or already used');
    if (result.kind !== 'registered') throw new ForbiddenError();
    return { device: result.device, credential };
  }

  async provisionKiosk(deviceId: string, adminUserId: string) {
    const provisioningCode = generateKioskProvisioningCode();
    const result = await this.repository.issueKioskProvisioningCode(deviceId, adminUserId, hashKioskSecret(provisioningCode));
    if (result.kind === 'not_found') throw new NotFoundError('Device not found');
    if (result.kind === 'inactive') throw new ConflictError('Activate this device before kiosk provisioning');
    if (result.kind !== 'created') throw new ConflictError('Could not issue kiosk provisioning code');
    return { provisioning_code: provisioningCode, expires_at: result.expiresAt, expires_in_seconds: 900 };
  }

  listAdminDevices() { return this.repository.listAdminDevices(); }

  async createAdminDevice(input: { device_code: string; name: string; location?: string | null; password: string }) {
    const deviceCode = input.device_code.trim().toUpperCase();
    const name = input.name.trim();
    if (!deviceCode || !name || !input.password.trim()) throw new ValidationError('Device code, name, and password are required');
    try { return await this.repository.createAdminDevice({ deviceCode, name, location: input.location?.trim() || null, password: input.password.trim() }); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictError('Device code already exists');
      throw error;
    }
  }

  async updateAdminDevice(id: string, input: { name?: string | null; location?: string | null; is_active?: boolean; password?: string; override_autoplay_spotify_playlist_uri?: string | null; fallback_playlist_url?: string | null; override_enabled?: boolean }) {
    const rawPlaylist = input.override_autoplay_spotify_playlist_uri !== undefined ? input.override_autoplay_spotify_playlist_uri : input.fallback_playlist_url;
    let playlistUri: string | null | undefined;
    if (rawPlaylist !== undefined) {
      if (rawPlaylist === null || rawPlaylist.trim() === '') playlistUri = null;
      else {
        const match = /(?:spotify:playlist:|open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})/.exec(rawPlaylist.trim());
        if (!match) throw new ValidationError('A valid Spotify playlist URI or URL is required');
        playlistUri = `spotify:playlist:${match[1]}`;
      }
    }
    const result = await this.repository.updateAdminDevice(id, {
      ...(input.name !== undefined ? { name: input.name?.trim() ?? null } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() ?? null } : {}),
      ...(input.is_active !== undefined ? { isActive: input.is_active } : {}),
      ...(input.password?.trim() ? { password: input.password.trim() } : {}),
      ...(playlistUri !== undefined ? { playlistUri } : {}),
      ...(input.override_enabled !== undefined ? { overrideEnabled: input.override_enabled } : {}),
    });
    if (!result) throw new NotFoundError('Device not found');
    return result;
  }

  async logoutAllDeviceSessions(id: string) {
    if (!await this.repository.logoutAllDeviceSessions(id)) throw new NotFoundError('Device not found');
    this.events.forceLogout(id);
  }

  async updateSpotifyPlaybackTarget(id: string, input: { spotify_playback_device_id?: string | null; spotify_player_name?: string | null }) {
    const deviceId = input.spotify_playback_device_id?.trim() || null;
    const playerName = input.spotify_player_name?.trim() || null;
    const result = await this.repository.updateSpotifyPlaybackTarget(id, { deviceId, playerName });
    if (!result) throw new NotFoundError('Device not found');
    return result;
  }

  async updatePlaybackTarget(id: string, input: { provider: 'spotify'; targetId: string | null; playerName?: string | null }) {
    const targetId = input.targetId?.trim() || null;
    const playerName = input.playerName?.trim() || null;
    const result = await this.updateSpotifyPlaybackTarget(id, {
      spotify_playback_device_id: targetId,
      spotify_player_name: playerName,
    });
    return { device: result, playback_target: { provider: input.provider, target_id: targetId, player_name: playerName } };
  }
}
