export interface RadioScheduleItem {
  [key: string]: unknown;
}

export interface RadioHistoryItem {
  title: string;
  artist: string;
  cover_url: string | null;
  played_at: Date;
}

export interface RadioRepository {
  listActiveSchedule(): Promise<RadioScheduleItem[]>;
  listRecentHistory(channelId: string): Promise<RadioHistoryItem[]>;
}
