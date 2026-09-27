import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { RadioHistoryItem, RadioRepository, RadioScheduleItem } from '../ports/radio.repository.js';

export class PrismaRadioRepository implements RadioRepository {
  constructor(private readonly client: PrismaClient) {}

  async listActiveSchedule() {
    const rows = await this.client.radioSchedule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map((row): RadioScheduleItem => ({
      id: row.id,
      day_of_week: row.dayOfWeek,
      start_time: row.startTime,
      end_time: row.endTime,
      show_name: row.showName,
      dj_name: row.djName,
      description: row.description,
      is_live: row.isLive,
      is_active: row.isActive,
      created_at: row.createdAt,
    }));
  }

  async listRecentHistory(channelId: string) {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const rows = await this.client.songHistory.findMany({
      where: { channelId, playedAt: { gt: cutoff } },
      orderBy: { playedAt: 'desc' },
      take: 100,
      select: { title: true, artist: true, coverUrl: true, playedAt: true },
    });
    return rows.map((row): RadioHistoryItem => ({
      title: row.title,
      artist: row.artist ?? '',
      cover_url: row.coverUrl,
      played_at: row.playedAt,
    }));
  }
}
