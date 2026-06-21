/**
 * JS side of the native Android Auto / Automotive media browser.
 *
 * Implements the RadioTEDU car design: a grid Browse Home with four
 * destinations + a Recently Played row, each destination a single flat list.
 *  - Live Radios   : the live channels (playable)
 *  - Podcasts      : recent episodes (playable)
 *  - Sıralamalar   : our weekly user leaderboard (glanceable)
 *  - Jukebox       : LISTEN-ONLY to the communal "What TEDU Plays" selection —
 *                    no QR, no adding, no voting in the car (driver safety)
 *
 * The car renders the dark, driver-optimized template; we only supply the tree +
 * metadata + content-style hints. Android-only; no-op without the native module.
 */
import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import TrackPlayer, {Event, State} from 'react-native-track-player';
import i18n from '../i18n';
import api from './api';
import {RADIO_CHANNELS} from '../data/radioChannels';
import {DEFAULT_STREAM_QUALITY, JUKEBOX_STREAM_URL} from './config';
import type {Podcast} from './podcastService';
import {
  buildChannelTrack,
  channelArtwork,
  ensureBrowsableQueue,
  findChannelByQuery,
  getRecentItems,
  playChannelById,
  playTrackById,
  PODCAST_ID_PREFIX,
} from './playbackQueue';

const CarBridge = NativeModules.RadioTeduCarBridge as
  | {
      setCatalog: (json: string) => void;
      updateNowPlaying: (
        title: string,
        artist: string,
        artwork: string,
        isPlaying: boolean,
      ) => void;
    }
  | undefined;

const isAvailable = Platform.OS === 'android' && !!CarBridge;
const MAIN_CHANNEL = 'radiotedu-main';
// Bundled vector tiles so the car grid matches the design's coloured destinations.
const TILE = 'android.resource://com.radiotedumobile/drawable/';

let cachedPodcasts: Podcast[] = [];

type CarItem = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  playable: boolean;
  // Direct stream/audio URL the NATIVE car service plays headlessly with
  // ExoPlayer (no dependency on the RN JS runtime). Empty for non-playable
  // items (e.g. jukebox:none). channelStreamUrl(...) is not exported from
  // playbackQueue, so we derive radio URLs via buildChannelTrack(...).url,
  // which is exactly channel.streams?.[quality] || channel.streamUrl.
  url: string;
};

const t = () => i18n.t.bind(i18n);

/** Stream URL for a channel id at the default quality, via the exported helper. */
function channelUrlById(channelId: string): string {
  const channel = RADIO_CHANNELS.find(c => c.id === channelId);
  if (!channel) {
    return '';
  }
  return buildChannelTrack(channel, DEFAULT_STREAM_QUALITY).url;
}

/** Stream URL of the main RadioTEDU channel (fallback for derived items). */
function mainChannelUrl(): string {
  return channelUrlById(MAIN_CHANNEL);
}

// --- Destination data (best-effort; empty on failure, never throws) ---

function radioItems(): CarItem[] {
  return RADIO_CHANNELS.map(c => ({
    id: c.id,
    title: c.name,
    subtitle: c.description,
    artwork: channelArtwork(c),
    playable: true,
    url: buildChannelTrack(c, DEFAULT_STREAM_QUALITY).url,
  }));
}

function podcastItems(): CarItem[] {
  return cachedPodcasts
    .filter(p => !!p.audioUrl)
    .slice(0, 12)
    .map(p => ({
      id: `${PODCAST_ID_PREFIX}${p.id}`,
      title: p.title,
      subtitle: p.feedTitle ?? '',
      artwork: p.imageUrl ?? '',
      playable: true,
      // filtered above on !!p.audioUrl, so this is always a real URL.
      url: p.audioUrl ?? '',
    }));
}

async function rankingItems(): Promise<CarItem[]> {
  try {
    const res = await api.get('/users/leaderboard', {
      params: {period: 'monthly', limit: 5},
    });
    const payload = res.data?.data ?? res.data ?? [];
    const list: any[] = Array.isArray(payload)
      ? payload
      : payload.items ?? payload.leaderboard ?? [];
    const mainUrl = mainChannelUrl();
    return list.slice(0, 5).map((u, i) => ({
      // Tapping a chart row tunes in to the main RadioTEDU channel.
      id: `rank:${i + 1}`,
      title: `${i + 1}. ${u.name ?? u.username ?? u.display_name ?? 'RadioTEDU'}`,
      subtitle: String(u.points ?? u.lifetime_points ?? u.score ?? ''),
      artwork: u.avatar_url ?? u.avatar ?? '',
      playable: true,
      url: mainUrl,
    }));
  } catch {
    return [];
  }
}

async function jukeboxItems(): Promise<CarItem[]> {
  try {
    const dev = await api.get('/jukebox/devices');
    const devices = dev.data?.data ?? dev.data ?? [];
    const first = Array.isArray(devices) ? devices[0] : devices?.items?.[0];
    const code = first?.device_code;
    if (!code) {
      return [];
    }
    const conn = await api.post('/jukebox/connect', {device_code: code});
    const data = conn.data?.data ?? conn.data ?? {};
    const now = data.now_playing ?? data.queue?.now_playing ?? null;
    const upNext: any[] = data.queue?.queue ?? data.queue ?? [];
    const items: CarItem[] = [];
    // All Jukebox rows are LISTEN-ONLY: tapping plays the communal stream
    // (the configured Jukebox feed when set, else the main channel).
    const jukeboxUrl = JUKEBOX_STREAM_URL || mainChannelUrl();
    if (now) {
      items.push({
        id: 'jukebox:now',
        title: now.title ?? now.name ?? '—',
        subtitle: now.artist ?? '',
        artwork: now.cover_url ?? now.image_url ?? '',
        playable: true,
        url: jukeboxUrl,
      });
    }
    (Array.isArray(upNext) ? upNext : []).slice(0, 5).forEach((s, i) =>
      items.push({
        id: `jukebox:next:${i}`,
        title: s.title ?? s.name ?? '—',
        subtitle: s.artist ?? '',
        artwork: s.cover_url ?? s.image_url ?? '',
        playable: true,
        url: jukeboxUrl,
      }),
    );
    return items;
  } catch {
    return [];
  }
}

async function recentItems(): Promise<CarItem[]> {
  const recents = await getRecentItems();
  const source: Array<{
    id: string;
    title: string;
    artist: string;
    artwork: string;
    url?: string;
  }> = recents.length
    ? recents
    : RADIO_CHANNELS.slice(0, 3).map(c => ({
        id: c.id,
        title: c.name,
        artist: c.description,
        artwork: channelArtwork(c),
        url: buildChannelTrack(c, DEFAULT_STREAM_QUALITY).url,
      }));
  return source.map(r => ({
    id: r.id,
    title: r.title,
    subtitle: r.artist,
    artwork: r.artwork,
    playable: true,
    // Carry the recent item's own url; if it has none (older recents predate
    // the url field), resolve by channel id, falling back to the main channel.
    url: r.url || channelUrlById(r.id) || mainChannelUrl(),
  }));
}

/** Build and push the full car browse tree (4 destinations + recently played). */
export async function pushCarCatalog(podcasts?: Podcast[]): Promise<void> {
  if (!isAvailable) {
    return;
  }
  if (podcasts) {
    cachedPodcasts = podcasts;
  }
  const tr = t();

  const pods = podcastItems();
  const [rankings, jukebox, recent] = await Promise.all([
    rankingItems(),
    jukeboxItems(),
    recentItems(),
  ]);

  const categories = [
    {
      id: 'cat_radio',
      title: tr('auto.liveRadio'),
      subtitle: tr('auto.stationsOnAir', {count: RADIO_CHANNELS.length}),
      artwork: `${TILE}car_tile_radio`,
      items: radioItems(),
    },
    {
      id: 'cat_podcasts',
      title: tr('auto.podcasts'),
      subtitle: tr('auto.showsCount', {count: pods.length}),
      artwork: `${TILE}car_tile_podcasts`,
      items: pods,
    },
    {
      id: 'cat_rankings',
      title: tr('auto.rankings'),
      subtitle: tr('auto.weeklyCharts'),
      artwork: `${TILE}car_tile_charts`,
      items: rankings,
    },
    {
      id: 'cat_jukebox',
      title: tr('auto.jukebox'),
      subtitle: tr('auto.communalQueue'),
      artwork: `${TILE}car_tile_jukebox`,
      items: jukebox.length
        ? jukebox
        : [
            {
              id: 'jukebox:none',
              title: tr('auto.notPlaying'),
              subtitle: '',
              artwork: '',
              playable: false,
              url: '',
            },
          ],
    },
  ];

  try {
    CarBridge!.setCatalog(JSON.stringify({categories, recent}));
  } catch {
    // best-effort
  }
}

// --- Car transport -> playback (RNTP plays the actual audio) ---

async function playJukeboxStream() {
  // Listen-only to the communal selection. Uses the configured Jukebox stream
  // when available, otherwise tunes in to the main channel.
  if (JUKEBOX_STREAM_URL) {
    const queue = await TrackPlayer.getQueue();
    let idx = queue.findIndex(track => track.id === 'jukebox-live');
    if (idx === -1) {
      await TrackPlayer.add({
        id: 'jukebox-live',
        url: JUKEBOX_STREAM_URL,
        title: 'Jukebox',
        artist: 'RadioTEDU',
        isLiveStream: true,
      });
      idx = (await TrackPlayer.getQueue()).length - 1;
    }
    await TrackPlayer.skip(idx);
    await TrackPlayer.play();
  } else {
    await playChannelById(MAIN_CHANNEL, DEFAULT_STREAM_QUALITY);
  }
}

async function handlePlayId(mediaId: string) {
  if (mediaId.startsWith('jukebox')) {
    await playJukeboxStream();
    return;
  }
  if (mediaId.startsWith('rank:')) {
    await playChannelById(MAIN_CHANNEL, DEFAULT_STREAM_QUALITY);
    return;
  }
  await ensureBrowsableQueue(DEFAULT_STREAM_QUALITY);
  const played = await playTrackById(mediaId);
  if (!played) {
    await playChannelById(mediaId, DEFAULT_STREAM_QUALITY);
  }
}

async function handleCommand(action: string, mediaId: string | null) {
  try {
    switch (action) {
      case 'play':
        await TrackPlayer.play();
        break;
      case 'pause':
        await TrackPlayer.pause();
        break;
      case 'stop':
        await TrackPlayer.stop();
        break;
      case 'next':
        await TrackPlayer.skipToNext();
        break;
      case 'previous':
        await TrackPlayer.skipToPrevious();
        break;
      case 'playId':
        if (mediaId) {
          await handlePlayId(mediaId);
        }
        break;
      case 'search': {
        const channel = findChannelByQuery(mediaId ?? '');
        await playChannelById(channel.id, DEFAULT_STREAM_QUALITY);
        break;
      }
    }
  } catch {
    // ignore — car commands must never crash the app
  }
}

async function pushNowPlaying() {
  if (!isAvailable) {
    return;
  }
  try {
    const track = await TrackPlayer.getActiveTrack();
    const {state} = await TrackPlayer.getPlaybackState();
    CarBridge!.updateNowPlaying(
      track?.title ?? 'RadioTEDU',
      (track?.artist as string) ?? '',
      (track?.artwork as string) ?? '',
      state === State.Playing,
    );
  } catch {
    // best-effort
  }
}

let initialized = false;

/** Register car command + now-playing listeners. Call once at startup. */
export function initCarBridge(): void {
  if (!isAvailable || initialized) {
    return;
  }
  initialized = true;

  DeviceEventEmitter.addListener('RadioTeduCarCommand', e => {
    handleCommand(e?.action, e?.mediaId ?? null);
  });

  TrackPlayer.addEventListener(Event.PlaybackState, pushNowPlaying);
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, pushNowPlaying);

  void pushCarCatalog();
}
