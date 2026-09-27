import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import { decryptSecret, encryptSecret } from '../../../../core/security/secret-box.js';
import { ValidationError } from '../../../../core/errors/app-error.js';
import type { Environment } from '../../../../core/config/env.js';
import type { SpotifyDeviceAuthRecord, SpotifyOAuthRepository, SpotifyTokenRecord } from '../ports/spotify-oauth.repository.js';

export class PrismaSpotifyOAuthRepository implements SpotifyOAuthRepository {
  constructor(private readonly client: PrismaClient, private readonly environment: Environment) {}

  private encrypt(value: string) {
    if (!this.environment.SPOTIFY_ENCRYPTION_KEY) throw new ValidationError('SPOTIFY_ENCRYPTION_KEY must be configured before Spotify OAuth');
    return encryptSecret(value, this.environment.SPOTIFY_ENCRYPTION_KEY);
  }
  private decrypt(value: string) { return decryptSecret(value, this.environment.SPOTIFY_ENCRYPTION_KEY); }

  async saveOAuthState(input: Parameters<SpotifyOAuthRepository['saveOAuthState']>[0]) {
    await this.client.spotifyOAuthState.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.client.spotifyOAuthState.create({ data: input });
  }

  async consumeOAuthState(stateHash: string, now: Date) {
    return this.client.$transaction(async (tx) => {
      const state = await tx.spotifyOAuthState.findUnique({
        where: { stateHash },
        include: { adminUser: { select: { role: true, isGuest: true } } },
      });
      if (!state || state.expiresAt <= now) return null;
      const removed = await tx.spotifyOAuthState.deleteMany({ where: { stateHash, expiresAt: { gt: now } } });
      if (removed.count !== 1) return null;
      return {
        stateKind: state.stateKind as 'admin' | 'device',
        adminUserId: state.adminUserId,
        adminRole: state.adminUser?.role ?? null,
        adminIsGuest: state.adminUser?.isGuest ?? null,
        deviceId: state.deviceId,
        returnOrigin: state.returnOrigin,
        codeVerifier: state.codeVerifier,
      };
    });
  }

  async deviceExists(deviceId: string) {
    return Boolean(await this.client.device.findFirst({ where: { id: deviceId, isActive: true }, select: { id: true } }));
  }

  async saveGlobalAuth(input: Omit<SpotifyTokenRecord, 'id'>) {
    await this.client.$transaction(async (tx) => {
      await tx.spotifyAuth.deleteMany({});
      await tx.spotifyAuth.create({ data: {
        userId: input.userId,
        accessToken: this.encrypt(input.accessToken),
        refreshToken: this.encrypt(input.refreshToken),
        tokenExpiresAt: input.expiresAt,
        scopes: input.scopes,
      } });
    }, { isolationLevel: 'Serializable' });
  }

  async getGlobalAuth(): Promise<SpotifyTokenRecord | null> {
    const row = await this.client.spotifyAuth.findFirst({ orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] });
    return row ? { id: row.id, userId: row.userId, accessToken: this.decrypt(row.accessToken), refreshToken: this.decrypt(row.refreshToken), expiresAt: row.tokenExpiresAt, scopes: row.scopes } : null;
  }

  async saveDeviceAuth(input: Omit<SpotifyDeviceAuthRecord, 'id' | 'userId'>) {
    await this.client.spotifyDeviceAuth.upsert({
      where: { deviceId: input.deviceId },
      create: {
        deviceId: input.deviceId,
        spotifyAccountId: input.spotifyAccountId,
        spotifyDisplayName: input.spotifyDisplayName,
        spotifyEmail: input.spotifyEmail,
        spotifyProduct: input.spotifyProduct,
        spotifyCountry: input.spotifyCountry,
        accessToken: this.encrypt(input.accessToken),
        refreshToken: this.encrypt(input.refreshToken),
        tokenExpiresAt: input.expiresAt,
        scopes: input.scopes,
      },
      update: {
        spotifyAccountId: input.spotifyAccountId,
        spotifyDisplayName: input.spotifyDisplayName,
        spotifyEmail: input.spotifyEmail,
        spotifyProduct: input.spotifyProduct,
        spotifyCountry: input.spotifyCountry,
        accessToken: this.encrypt(input.accessToken),
        refreshToken: this.encrypt(input.refreshToken),
        tokenExpiresAt: input.expiresAt,
        scopes: input.scopes,
      },
    });
  }

  async getDeviceAuth(deviceId: string): Promise<SpotifyDeviceAuthRecord | null> {
    const row = await this.client.spotifyDeviceAuth.findUnique({ where: { deviceId } });
    return row ? {
      id: row.id, userId: null, deviceId: row.deviceId, spotifyAccountId: row.spotifyAccountId,
      spotifyDisplayName: row.spotifyDisplayName, spotifyEmail: row.spotifyEmail, spotifyProduct: row.spotifyProduct,
      spotifyCountry: row.spotifyCountry, accessToken: this.decrypt(row.accessToken), refreshToken: this.decrypt(row.refreshToken),
      expiresAt: row.tokenExpiresAt, scopes: row.scopes,
    } : null;
  }

  async getDeviceAuthStatus(deviceId: string) {
    const row = await this.client.spotifyDeviceAuth.findUnique({ where: { deviceId }, select: {
      deviceId: true, spotifyAccountId: true, spotifyDisplayName: true, spotifyEmail: true, spotifyProduct: true,
      spotifyCountry: true, tokenExpiresAt: true, scopes: true, refreshToken: true,
    } });
    return row ? {
      deviceId: row.deviceId, connected: true, spotifyAccountId: row.spotifyAccountId,
      spotifyDisplayName: row.spotifyDisplayName, spotifyEmail: row.spotifyEmail, spotifyProduct: row.spotifyProduct,
      spotifyCountry: row.spotifyCountry, tokenExpiresAt: row.tokenExpiresAt, scopes: row.scopes,
      hasRefreshToken: Boolean(row.refreshToken),
    } : { deviceId, connected: false, spotifyAccountId: null, spotifyDisplayName: null, spotifyEmail: null, spotifyProduct: null, spotifyCountry: null, tokenExpiresAt: null, scopes: null, hasRefreshToken: false };
  }

  async listDeviceAuthIds() {
    const rows = await this.client.spotifyDeviceAuth.findMany({ select: { deviceId: true } });
    return rows.map((row) => row.deviceId);
  }

  async deleteDeviceAuth(deviceId: string) {
    const result = await this.client.spotifyDeviceAuth.deleteMany({ where: { deviceId } });
    return result.count > 0;
  }

  async getPlaybackTarget(deviceId: string) {
    const device = await this.client.device.findUnique({ where: { id: deviceId }, select: { spotifyPlaybackDeviceId: true, spotifyPlayerIsActive: true } });
    return device ? { targetId: device.spotifyPlaybackDeviceId, isActive: device.spotifyPlayerIsActive } : null;
  }
}
