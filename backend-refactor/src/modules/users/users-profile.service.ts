import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/app-error.js';
import type { IdentityUserRecord } from '../identity/ports/user.repository.js';
import type { UserProfileRepository } from './ports/user-profile.repository.js';
import { normalizeProfilePayload, type ProfilePayload } from './users.schema.js';
import { toProfileDto } from './users.dto.js';
import { fileTypeFromBuffer } from 'file-type';
import type { StorageService } from '../../core/ports/storage.port.js';
import type { IdGenerator } from '../../core/ports/id-generator.port.js';

export class UsersProfileService {
  constructor(private readonly profiles: UserProfileRepository, private readonly users: { findById(id: string): Promise<IdentityUserRecord> }, private readonly storage: StorageService, private readonly ids: IdGenerator) {}

  async getMyProfile(userId: string) {
    const result = await this.profiles.getProfile(userId);
    if (!result) throw new NotFoundError('User not found');
    return { profile: toProfileDto(result.user, result.profile), badges: [] };
  }

  async updateMyProfile(userId: string, payload: ProfilePayload) {
    const user = await this.users.findById(userId);
    if (user.isGuest || user.role.toLowerCase() === 'guest') throw new ForbiddenError('Account required');
    const normalized = normalizeProfilePayload(payload);
    const updated = await this.profiles.updateProfile(userId, normalized);
    const result = await this.profiles.getProfile(userId);
    if (!result) throw new ValidationError('Profile update did not persist');
    return toProfileDto(result.user, updated);
  }

  async uploadAvatar(userId: string, content: Uint8Array) {
    const user = await this.users.findById(userId);
    if (user.isGuest || user.role.toLowerCase() === 'guest') throw new ForbiddenError('Account required');
    const type = await fileTypeFromBuffer(content);
    if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) throw new ValidationError('Avatar must be a JPEG, PNG, or WebP image');
    const key = `avatars/${this.ids.generate()}.${type.ext}`;
    const avatarUrl = `/uploads/${key}`;
    const stored = await this.storage.put({ key, content, contentType: type.mime });
    try {
      const updated = await this.profiles.updateAvatar(userId, avatarUrl);
      if (!updated) {
        await this.storage.delete(stored.key);
        throw new NotFoundError('User not found');
      }
      const oldKey = updated.previousAvatarUrl?.startsWith('/uploads/avatars/')
        ? updated.previousAvatarUrl.slice('/uploads/'.length)
        : null;
      if (oldKey && oldKey !== stored.key) await this.storage.delete(oldKey).catch(() => undefined);
      return { avatar_url: avatarUrl };
    } catch (error) {
      if (!(error instanceof NotFoundError)) await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }
}
