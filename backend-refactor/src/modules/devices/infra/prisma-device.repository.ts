import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { hashKioskSecret, kioskSecretMatches } from '../../../core/security/kiosk-credential.js';
import type { DeviceRepository, KioskRegistrationResult, PublicDevice, RegisteredDevice } from '../ports/device.repository.js';

const now = () => new Date();

function toPublicDevice(device: { id: string; deviceCode: string; name: string; location: string | null }): PublicDevice {
  return { id: device.id, device_code: device.deviceCode, name: device.name, location: device.location };
}

function toRegisteredDevice(device: {
  id: string; deviceCode: string; name: string; location: string | null; isActive: boolean | null;
  currentSongId: string | null; lastHeartbeat: Date | null; createdAt: Date | null;
}): RegisteredDevice {
  return {
    ...toPublicDevice(device),
    is_active: device.isActive === true,
    current_song_id: device.currentSongId,
    last_heartbeat: device.lastHeartbeat,
    created_at: device.createdAt ?? new Date(0),
  };
}

export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly client: PrismaClient) {}

  async listPublicDevices() {
    const devices = await this.client.device.findMany({
      where: { isActive: true },
      select: { id: true, deviceCode: true, name: true, location: true },
      orderBy: { name: 'asc' },
    });
    return devices.map(toPublicDevice);
  }

  issueKioskProvisioningCode(deviceId: string, createdBy: string, codeHash: string) {
    return this.client.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: deviceId }, select: { id: true, isActive: true } });
      if (!device) return { kind: 'not_found' as const };
      if (!device.isActive) return { kind: 'inactive' as const };
      await tx.kioskProvisioningCode.updateMany({
        where: { deviceId, usedAt: null },
        data: { usedAt: now() },
      });
      const created = await tx.kioskProvisioningCode.create({
        data: {
          deviceId,
          codeHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          createdBy,
        },
        select: { expiresAt: true },
      });
      return { kind: 'created' as const, expiresAt: created.expiresAt };
    }, { isolationLevel: 'Serializable' });
  }

  registerKiosk(input: { deviceCode: string; credential?: string; provisioningCode?: string; newCredential: string; newCredentialHash: string }): Promise<KioskRegistrationResult> {
    return this.client.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { deviceCode: input.deviceCode },
        select: { id: true, isActive: true },
      });
      if (!device) return { kind: 'not_found' };
      if (!device.isActive) return { kind: 'inactive' };

      const timestamp = now();
      if (input.credential) {
        const existing = await tx.kioskCredential.findUnique({ where: { deviceId: device.id } });
        if (!existing || existing.revokedAt || existing.expiresAt <= timestamp
            || !kioskSecretMatches(existing.credentialHash, input.credential)) {
          return { kind: 'invalid_credential' };
        }
        await tx.kioskCredential.update({
          where: { deviceId: device.id },
          data: { expiresAt: new Date(timestamp.getTime() + 24 * 60 * 60 * 1000), updatedAt: timestamp },
        });
      } else {
        const codeHash = hashKioskSecret(input.provisioningCode!);
        const code = await tx.kioskProvisioningCode.findFirst({
          where: { deviceId: device.id, codeHash, usedAt: null, expiresAt: { gt: timestamp } },
          select: { id: true },
        });
        if (!code) return { kind: 'invalid_provisioning_code' };
        const consumed = await tx.kioskProvisioningCode.updateMany({
          where: { id: code.id, usedAt: null, expiresAt: { gt: timestamp } },
          data: { usedAt: timestamp },
        });
        if (consumed.count !== 1) return { kind: 'invalid_provisioning_code' };
        await tx.kioskCredential.upsert({
          where: { deviceId: device.id },
          create: {
            deviceId: device.id,
            credentialHash: input.newCredentialHash,
            expiresAt: new Date(timestamp.getTime() + 24 * 60 * 60 * 1000),
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          update: {
            credentialHash: input.newCredentialHash,
            expiresAt: new Date(timestamp.getTime() + 24 * 60 * 60 * 1000),
            revokedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
      }

      const heartbeat = await tx.device.updateMany({
        where: { id: device.id, isActive: true },
        data: { lastHeartbeat: timestamp },
      });
      if (heartbeat.count !== 1) return { kind: 'inactive' };
      const updatedDevice = await tx.device.findUnique({
        where: { id: device.id },
        select: { id: true, deviceCode: true, name: true, location: true, isActive: true, currentSongId: true, lastHeartbeat: true, createdAt: true },
      });
      if (!updatedDevice || !updatedDevice.isActive) return { kind: 'inactive' };
      return { kind: 'registered', device: toRegisteredDevice(updatedDevice) };
    }, { isolationLevel: 'Serializable' });
  }

  async listAdminDevices() {
    const devices = await this.client.device.findMany({
      select: { id: true, deviceCode: true, name: true, location: true, isActive: true, currentSongId: true, lastHeartbeat: true, createdAt: true, overrideAutoplaySpotifyPlaylistUri: true, overrideEnabled: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!devices.length) return [];
    const ids = devices.map((device) => device.id);
    const [counts, songs] = await Promise.all([
      this.client.queueItem.groupBy({ by: ['deviceId'], where: { deviceId: { in: ids }, status: 'pending' }, _count: { _all: true } }),
      this.client.song.findMany({ where: { id: { in: devices.flatMap((device) => device.currentSongId ? [device.currentSongId] : []) } }, select: { id: true, title: true, artist: true } }),
    ]);
    const countById = new Map(counts.map((row) => [row.deviceId, row._count._all]));
    const songById = new Map(songs.map((song) => [song.id, song]));
    return devices.map((device) => {
      const currentSong = device.currentSongId ? songById.get(device.currentSongId) : undefined;
      return {
        id: device.id, device_code: device.deviceCode, name: device.name, location: device.location,
        is_active: device.isActive, current_song_id: device.currentSongId, last_heartbeat: device.lastHeartbeat,
        created_at: device.createdAt, override_autoplay_spotify_playlist_uri: device.overrideAutoplaySpotifyPlaylistUri,
        override_enabled: device.overrideEnabled, queue_count: countById.get(device.id) ?? 0,
        current_song_title: currentSong?.title ?? null, current_song_artist: currentSong?.artist ?? null,
      };
    });
  }

  async createAdminDevice(input: { deviceCode: string; name: string; location: string | null; password: string }) {
    const device = await this.client.device.create({ data: { deviceCode: input.deviceCode, name: input.name.slice(0, 100), location: input.location?.slice(0, 200) ?? null, password: input.password.slice(0, 50) }, select: { id: true, deviceCode: true, name: true, location: true, isActive: true, currentSongId: true, lastHeartbeat: true, createdAt: true } });
    return { id: device.id, device_code: device.deviceCode, name: device.name, location: device.location, is_active: device.isActive, current_song_id: device.currentSongId, last_heartbeat: device.lastHeartbeat, created_at: device.createdAt };
  }

  async updateAdminDevice(id: string, input: { name?: string | null; location?: string | null; isActive?: boolean; password?: string; playlistUri?: string | null; overrideEnabled?: boolean }) {
    const data = {
      ...(input.name !== undefined && input.name !== null ? { name: input.name.slice(0, 100) } : {}),
      ...(input.location !== undefined ? { location: input.location?.slice(0, 200) ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { password: input.password.slice(0, 50) } : {}),
      ...(input.playlistUri !== undefined ? { overrideAutoplaySpotifyPlaylistUri: input.playlistUri } : {}),
      ...(input.overrideEnabled !== undefined ? { overrideEnabled: input.overrideEnabled } : {}),
    };
    const changed = await this.client.device.updateMany({ where: { id }, data });
    if (!changed.count) return null;
    const device = await this.client.device.findUnique({ where: { id }, select: { id: true, deviceCode: true, name: true, location: true, isActive: true, currentSongId: true, lastHeartbeat: true, createdAt: true, overrideAutoplaySpotifyPlaylistUri: true, overrideEnabled: true } });
    if (!device) return null;
    return { id: device.id, device_code: device.deviceCode, name: device.name, location: device.location, is_active: device.isActive, current_song_id: device.currentSongId, last_heartbeat: device.lastHeartbeat, created_at: device.createdAt, override_autoplay_spotify_playlist_uri: device.overrideAutoplaySpotifyPlaylistUri, override_enabled: device.overrideEnabled };
  }

  async logoutAllDeviceSessions(id: string) {
    const device = await this.client.device.findUnique({ where: { id }, select: { id: true } });
    if (!device) return false;
    await this.client.$transaction(async (tx) => {
      const timestamp = now();
      await tx.deviceSession.deleteMany({ where: { deviceId: id } });
      await tx.kioskCredential.updateMany({ where: { deviceId: id }, data: { revokedAt: timestamp, updatedAt: timestamp } });
      await tx.kioskProvisioningCode.updateMany({ where: { deviceId: id, usedAt: null }, data: { usedAt: timestamp } });
    });
    return true;
  }

  async updateSpotifyPlaybackTarget(id: string, input: { deviceId: string | null; playerName: string | null }) {
    const found = await this.client.device.findUnique({ where: { id }, select: { id: true } });
    if (!found) return null;
    const active = Boolean(input.deviceId);
    const updated = await this.client.device.update({ where: { id }, data: {
      spotifyPlaybackDeviceId: input.deviceId,
      spotifyPlayerName: active ? (input.playerName || 'Spotify Connect Player').slice(0, 200) : null,
      spotifyPlayerIsActive: active,
      spotifyPlayerConnectedAt: active ? new Date() : null,
    }, select: { id: true, deviceCode: true, spotifyPlaybackDeviceId: true, spotifyPlayerName: true, spotifyPlayerIsActive: true, spotifyPlayerConnectedAt: true } });
    return { id: updated.id, device_code: updated.deviceCode, spotify_playback_device_id: updated.spotifyPlaybackDeviceId, spotify_player_name: updated.spotifyPlayerName, spotify_player_is_active: updated.spotifyPlayerIsActive, spotify_player_connected_at: updated.spotifyPlayerConnectedAt };
  }
}
