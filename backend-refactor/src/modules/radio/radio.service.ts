import type { RadioRepository } from './ports/radio.repository.js';
import { NotFoundError } from '../../core/errors/app-error.js';

export class RadioService {
  constructor(
    private readonly repository: RadioRepository,
    private readonly streamUrl: string,
  ) {}

  getStatus() {
    return {
      is_live: true,
      stream_url: this.streamUrl,
      current_show: 'Non-stop Müzik',
      listeners_count: 0,
    };
  }

  getSchedule() {
    return this.repository.listActiveSchedule();
  }

  async getHistory(channelId: string) {
    if (!channelId.trim()) throw new NotFoundError('Radio channel not found');
    return this.repository.listRecentHistory(channelId);
  }
}
