import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import { decryptSecret, encryptSecret } from '../../../../core/security/secret-box.js';
import { ValidationError } from '../../../../core/errors/app-error.js';
import type { Environment } from '../../../../core/config/env.js';
import type { SpotifyConfigReader, SpotifyCredentials } from '../ports/spotify-config.repository.js';

export class PrismaSpotifyConfigRepository implements SpotifyConfigReader {
  constructor(private readonly client: PrismaClient, private readonly environment: Environment) {}

  async getCredentials(): Promise<SpotifyCredentials | null> {
    const stored = await this.client.spotifyAppConfig.findUnique({ where: { id: 1 }, select: { clientId: true, clientSecret: true } });
    const clientId = stored?.clientId ?? this.environment.SPOTIFY_CLIENT_ID;
    const secret = stored?.clientSecret ?? this.environment.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !secret) return null;
    return {
      clientId,
      clientSecret: decryptSecret(secret, this.environment.SPOTIFY_ENCRYPTION_KEY),
    };
  }

  async getAdminConfig() {
    const stored = await this.client.spotifyAppConfig.findUnique({ where: { id: 1 }, select: { clientId: true, clientSecret: true } });
    const clientId = stored?.clientId ?? this.environment.SPOTIFY_CLIENT_ID ?? '';
    const rawSecret = stored?.clientSecret ?? this.environment.SPOTIFY_CLIENT_SECRET ?? '';
    const secret = rawSecret ? decryptSecret(rawSecret, this.environment.SPOTIFY_ENCRYPTION_KEY) : '';
    return {
      clientId,
      clientSecretMasked: secret ? '********' : '',
      clientSecretSet: Boolean(secret),
      redirectUri: this.environment.SPOTIFY_REDIRECT_URI ?? '',
      redirectUriReadOnly: true as const,
      source: stored ? 'db' as const : 'env' as const,
    };
  }

  async saveAdminConfig(input: { clientId: string; clientSecret?: string }) {
    if (input.clientSecret && !this.environment.SPOTIFY_ENCRYPTION_KEY) throw new ValidationError('SPOTIFY_ENCRYPTION_KEY must be configured before saving Spotify credentials');
    const current = await this.client.spotifyAppConfig.findUnique({ where: { id: 1 }, select: { clientSecret: true } });
    const environmentSecret = this.environment.SPOTIFY_CLIENT_SECRET;
    if (!input.clientSecret && !current?.clientSecret && environmentSecret && !this.environment.SPOTIFY_ENCRYPTION_KEY) {
      throw new ValidationError('SPOTIFY_ENCRYPTION_KEY must be configured before moving environment credentials into the database');
    }
    const secret = input.clientSecret
      ? encryptSecret(input.clientSecret, this.environment.SPOTIFY_ENCRYPTION_KEY!)
      : current?.clientSecret ?? (environmentSecret ? encryptSecret(environmentSecret, this.environment.SPOTIFY_ENCRYPTION_KEY!) : null);
    if (!secret) throw new ValidationError('client_secret is required when no Spotify secret is configured');
    await this.client.spotifyAppConfig.upsert({
      where: { id: 1 },
      create: { id: 1, clientId: input.clientId, clientSecret: secret },
      update: { clientId: input.clientId, ...(input.clientSecret ? { clientSecret: secret } : {}) },
    });
  }
}
