import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIO_FAVORITES_KEY = 'radiotedu_radio_favorites_v1';

type ChannelLike = {
  id: string;
};

export function toggleFavoriteChannelId(favoriteIds: string[], channelId: string): string[] {
  if (favoriteIds.includes(channelId)) {
    return favoriteIds.filter((id) => id !== channelId);
  }

  return [...favoriteIds, channelId];
}

export function buildFavoriteChannelOrder<T extends ChannelLike>(
  channels: T[],
  favoriteIds: string[],
) {
  const favoriteIdSet = new Set(favoriteIds);
  const favorites = channels.filter((channel) => favoriteIdSet.has(channel.id));
  const remaining = channels.filter((channel) => !favoriteIdSet.has(channel.id));

  return {favorites, remaining};
}

export async function loadFavoriteChannelIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(RADIO_FAVORITES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveFavoriteChannelIds(favoriteIds: string[]) {
  await AsyncStorage.setItem(RADIO_FAVORITES_KEY, JSON.stringify(favoriteIds));
}
