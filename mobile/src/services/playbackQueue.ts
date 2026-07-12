/**
 * Single source of truth for the TrackPlayer queue.
 *
 * The queue is also what Android Auto / CarPlay browse, so it must always hold
 * the full, stable set of playable items - the live radio channels first, then
 * (optionally) recent podcast episodes. Every play action skips *within* this
 * queue instead of resetting it, so the car browse list never collapses.
 *
 * react-native-track-player v4 exposes the queue to the car as a single flat
 * list (no nested folders from JS), so channels and podcasts share one queue.
 */
import TrackPlayer, {Track} from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RADIO_CHANNELS,
  isChannelPlayable,
  RadioChannel,
  resolveStreamQuality,
  StreamQuality,
} from '../data/radioChannels';
import type {Podcast} from './podcastService';

export const PODCAST_ID_PREFIX = 'podcast:';

const RECENTS_KEY = '@radiotedu/recents';
const MAX_RECENTS = 6;

export interface RecentItem {
  id: string;
  title: string;
  artist: string;
  artwork: string;
}

/** Remember a played item for the car "Recently Played" row (most-recent first). */
async function recordRecent(track: Track): Promise<void> {
  if (!track?.id) {
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const list: RecentItem[] = raw ? JSON.parse(raw) : [];
    const next = [
      {
        id: String(track.id),
        title: track.title ?? 'RadioTEDU',
        artist: (track.artist as string) ?? '',
        artwork: (track.artwork as string) ?? '',
      },
      ...list.filter(r => r.id !== track.id),
    ].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // best-effort
  }
}

export async function getRecentItems(): Promise<RecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const FALLBACK_ARTWORK =
  'https://radiotedu.com/wp-content/uploads/2025/07/logo-02-scaled.png';
const PODCAST_ARTIST_FALLBACK = 'RadioTEDU Podcast';

// Cache of podcasts to expose in the car, set once at startup by App.tsx.
let cachedPodcasts: Podcast[] = [];

export function isPodcastId(id: string | undefined | null): boolean {
  return !!id && id.startsWith(PODCAST_ID_PREFIX);
}

export function channelArtwork(channel: RadioChannel): string {
  return channel.artwork || channel.logo || FALLBACK_ARTWORK;
}

export function channelStreamUrl(
  channel: RadioChannel,
  quality: StreamQuality,
): string {
  const resolvedQuality = resolveStreamQuality(channel, quality);
  return channel.streams?.[resolvedQuality] || channel.streamUrl;
}

export function buildChannelTrack(
  channel: RadioChannel,
  quality: StreamQuality,
): Track {
  const resolvedQuality = resolveStreamQuality(channel, quality);
  const codec = channel.codecLabels?.[resolvedQuality];
  return {
    id: channel.id,
    url: channelStreamUrl(channel, resolvedQuality),
    title: channel.name,
    artist: codec ? `${channel.description} - ${codec}` : channel.description,
    artwork: channelArtwork(channel),
    isLiveStream: true,
  };
}

export function buildPodcastTrack(podcast: Podcast): Track | null {
  if (!podcast.audioUrl) {
    return null; // external-only episodes can't be played in the car
  }
  return {
    id: `${PODCAST_ID_PREFIX}${podcast.id}`,
    url: podcast.audioUrl,
    title: podcast.title,
    artist: podcast.feedTitle || PODCAST_ARTIST_FALLBACK,
    artwork: podcast.imageUrl || FALLBACK_ARTWORK,
    isLiveStream: false,
  };
}

export function buildRadioQueue(quality: StreamQuality): Track[] {
  return RADIO_CHANNELS
    .filter(isChannelPlayable)
    .map(channel => buildChannelTrack(channel, quality));
}

function buildPodcastQueue(podcasts: Podcast[]): Track[] {
  return podcasts
    .map(buildPodcastTrack)
    .filter((track): track is Track => track !== null);
}

/** Store podcasts so they appear in the car browse list. */
export function setCachedPodcasts(podcasts: Podcast[]): void {
  cachedPodcasts = podcasts;
}

/** Replace the entire queue with channels (+ cached podcasts). */
export async function rebuildBrowsableQueue(
  quality: StreamQuality,
): Promise<void> {
  await TrackPlayer.reset();
  await TrackPlayer.add(buildRadioQueue(quality));
  const podcastTracks = buildPodcastQueue(cachedPodcasts);
  if (podcastTracks.length > 0) {
    await TrackPlayer.add(podcastTracks);
  }
}

/**
 * Make sure the queue holds all channels (in order) before we skip into it.
 * Rebuilds only when the channels are missing - e.g. first launch - so we
 * don't needlessly disturb a queue the car is already browsing.
 */
export async function ensureBrowsableQueue(
  quality: StreamQuality,
): Promise<void> {
  const queue = await TrackPlayer.getQueue();
  const playableChannels = RADIO_CHANNELS.filter(isChannelPlayable);
  const hasAllChannels = playableChannels.every((channel, index) => {
    return queue[index]?.id === channel.id;
  });
  if (!hasAllChannels) {
    await rebuildBrowsableQueue(quality);
  }
}

/** Skip to a track already in the queue by its id, then play. */
export async function playTrackById(id: string): Promise<boolean> {
  const queue = await TrackPlayer.getQueue();
  const index = queue.findIndex(track => track.id === id);
  if (index === -1) {
    return false;
  }
  await TrackPlayer.skip(index);
  await TrackPlayer.play();
  void recordRecent(queue[index]);
  return true;
}

/** Ensure the channel queue exists, then play the requested channel. */
export async function playChannelById(
  channelId: string,
  quality: StreamQuality,
): Promise<void> {
  const channel = RADIO_CHANNELS.find(item => item.id === channelId);
  if (channel && !isChannelPlayable(channel)) {
    return;
  }
  await ensureBrowsableQueue(quality);
  const played = await playTrackById(channelId);
  if (!played) {
    // Channel wasn't in the queue (stale queue) - rebuild and retry once.
    await rebuildBrowsableQueue(quality);
    await playTrackById(channelId);
  }
}

/**
 * Replace one channel's track in place (used when the user changes stream
 * quality) without tearing down the rest of the browsable queue.
 */
export async function replaceChannelTrack(
  channel: RadioChannel,
  quality: StreamQuality,
): Promise<void> {
  const queue = await TrackPlayer.getQueue();
  const index = queue.findIndex(track => track.id === channel.id);
  if (index === -1) {
    await rebuildBrowsableQueue(quality);
    return;
  }
  await TrackPlayer.remove(index);
  await TrackPlayer.add(buildChannelTrack(channel, quality), index);
}

/**
 * Match a free-text voice query ("Play RadioTEDU", "put on jazz") to a channel.
 * Falls back to the main channel when nothing matches so voice always plays.
 */
export function findChannelByQuery(query: string): RadioChannel {
  const normalized = normalizeChannelQuery(query);
  if (normalized.length > 0) {
    const scored = RADIO_CHANNELS.map(channel => {
      let score = 0;
      const name = normalizeChannelQuery(channel.name);
      const mount = normalizeChannelQuery(channel.mountPath);
      const description = normalizeChannelQuery(channel.description);
      const id = normalizeChannelQuery(channel.id);
      const haystack = normalizeChannelQuery(
        `${channel.name} ${channel.description} ${channel.id} ${channel.mountPath}`,
      );
      if (haystack.includes(normalized)) {
        score += 1;
      }
      if (normalized.includes(name)) {
        score += channel.id === 'radiotedu-main' ? 2 : 5;
      }
      if (mount && normalized.includes(mount)) {
        score += 6;
      }
      if (description && normalized.includes(description)) {
        score += channel.role === 'ai-host' ? 5 : 2;
      }
      if (normalized.includes(id)) {
        score += 4;
      }
      return {channel, score};
    })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored[0]) {
      return scored[0].channel;
    }
  }
  return RADIO_CHANNELS[0];
}

function normalizeChannelQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ');
}
