import type { RadioHistoryItem } from './ports/radio.repository.js';

export function toRadioHistoryDto(item: RadioHistoryItem) {
  return {
    title: item.title,
    artist: item.artist,
    cover_url: item.cover_url,
    played_at: item.played_at,
  };
}
