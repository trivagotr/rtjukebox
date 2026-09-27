import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { RadioProfilesRepository } from '../ports/radio-profiles.repository.js';

const profileInclude = { assets: { include: { song: true }, orderBy: { sortOrder: 'asc' as const } }, playlistStats: true };
const toProfileData = (input: Record<string, unknown>) => ({
  ...(input['name'] !== undefined ? { name: input['name'] as string } : {}),
  ...(input['autoplay_spotify_playlist_uri'] !== undefined ? { autoplaySpotifyPlaylistUri: input['autoplay_spotify_playlist_uri'] as string | null } : {}),
  ...(input['jingle_every_n_songs'] !== undefined ? { jingleEveryNSongs: input['jingle_every_n_songs'] as number | null } : {}),
  ...(input['ad_break_interval_minutes'] !== undefined ? { adBreakIntervalMinutes: input['ad_break_interval_minutes'] as number | null } : {}),
  ...(input['is_active'] !== undefined ? { isActive: input['is_active'] as boolean } : {}),
});

export class PrismaRadioProfilesRepository implements RadioProfilesRepository {
  constructor(private readonly client: PrismaClient) {}
  list() { return this.client.radioProfile.findMany({ include: profileInclude, orderBy: { name: 'asc' } }); }
  get(id: string) { return this.client.radioProfile.findUnique({ where: { id }, include: profileInclude }); }
  create(input: Record<string, unknown>) { return this.client.radioProfile.create({ data: { ...toProfileData(input), name: input['name'] as string }, include: profileInclude }); }
  async update(id: string, input: Record<string, unknown>) {
    const result = await this.client.radioProfile.updateMany({ where: { id }, data: toProfileData(input) });
    return result.count ? this.get(id) : null;
  }
  async delete(id: string) {
    const result = await this.client.radioProfile.deleteMany({ where: { id } });
    return result.count > 0;
  }
  async attachAsset(profileId: string, input: { songId: string; slotType: 'jingle' | 'ad'; sortOrder?: number | null }) {
    const [profile, song] = await Promise.all([
      this.client.radioProfile.findUnique({ where: { id: profileId }, select: { id: true } }),
      this.client.song.findUnique({ where: { id: input.songId }, select: { id: true, sourceType: true, visibility: true, assetRole: true, isActive: true, isBlocked: true } }),
    ]);
    if (!profile || !song || song.sourceType !== 'local' || song.visibility !== 'hidden' || song.assetRole !== input.slotType || song.isActive === false || song.isBlocked === true) return null;
    return this.client.radioProfileAsset.upsert({
      where: { radioProfileId_songId_slotType: { radioProfileId: profileId, songId: input.songId, slotType: input.slotType } },
      create: { radioProfileId: profileId, songId: input.songId, slotType: input.slotType, sortOrder: input.sortOrder ?? 0 },
      update: { sortOrder: input.sortOrder ?? 0 },
    });
  }
  async detachAsset(profileId: string, songId: string, slotType: 'jingle' | 'ad') {
    const result = await this.client.radioProfileAsset.deleteMany({ where: { radioProfileId: profileId, songId, slotType } });
    return result.count > 0;
  }
  async assignDevice(deviceId: string, profileId: string | null) {
    if (profileId && !await this.client.radioProfile.findUnique({ where: { id: profileId }, select: { id: true } })) return null;
    const result = await this.client.device.updateMany({ where: { id: deviceId }, data: { radioProfileId: profileId } });
    return result.count ? this.client.device.findUnique({ where: { id: deviceId }, select: { id: true, deviceCode: true, radioProfileId: true } }) : null;
  }
  async updateDeviceOverride(deviceId: string, input: Record<string, unknown>) {
    const data = {
      ...(input['override_enabled'] !== undefined ? { overrideEnabled: input['override_enabled'] as boolean } : {}),
      ...(input['autoplay_spotify_playlist_uri'] !== undefined ? { overrideAutoplaySpotifyPlaylistUri: input['autoplay_spotify_playlist_uri'] as string | null } : {}),
      ...(input['jingle_every_n_songs'] !== undefined ? { overrideJingleEveryNSongs: input['jingle_every_n_songs'] as number | null } : {}),
      ...(input['ad_break_interval_minutes'] !== undefined ? { overrideAdBreakIntervalMinutes: input['ad_break_interval_minutes'] as number | null } : {}),
    };
    const result = await this.client.device.updateMany({ where: { id: deviceId }, data });
    return result.count ? this.client.device.findUnique({ where: { id: deviceId }, select: { id: true, radioProfileId: true, overrideEnabled: true, overrideAutoplaySpotifyPlaylistUri: true, overrideJingleEveryNSongs: true, overrideAdBreakIntervalMinutes: true } }) : null;
  }
}
