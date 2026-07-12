import TrackPlayer, {Event} from 'react-native-track-player';
import {
  ensureBrowsableQueue,
  findChannelByQuery,
  playChannelById,
  playTrackById,
  PODCAST_ID_PREFIX,
} from './playbackQueue';
import {DEFAULT_STREAM_QUALITY, JUKEBOX_STREAM_URL} from './config';
import {Analytics} from './analyticsService';

async function playLatestPodcast(): Promise<boolean> {
  await ensureBrowsableQueue(DEFAULT_STREAM_QUALITY);
  const queue = await TrackPlayer.getQueue();
  const index = queue.findIndex(track => String(track.id).startsWith(PODCAST_ID_PREFIX));
  if (index === -1) {
    return false;
  }
  await TrackPlayer.skip(index);
  await TrackPlayer.play();
  Analytics.carPlayback('android-auto', String(queue[index].id));
  return true;
}

async function playJukeboxVoiceAction(): Promise<void> {
  if (JUKEBOX_STREAM_URL) {
    const queue = await TrackPlayer.getQueue();
    let index = queue.findIndex(track => track.id === 'jukebox-live');
    if (index === -1) {
      await TrackPlayer.add({
        id: 'jukebox-live',
        url: JUKEBOX_STREAM_URL,
        title: 'Jukebox',
        artist: 'RadioTEDU',
        isLiveStream: true,
      });
      index = (await TrackPlayer.getQueue()).length - 1;
    }
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
    Analytics.carPlayback('android-auto', 'jukebox-live');
    return;
  }
  await playChannelById('radiotedu-main', DEFAULT_STREAM_QUALITY);
  Analytics.carPlayback('android-auto', 'radiotedu-main');
}

export const PlaybackService = async function () {
  // Transport controls (notification, lock screen, car, headset, Bluetooth).
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext(),
  );
  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious(),
  );

  // Android Auto / CarPlay: user tapped an item in the browse list.
  // The id is a channel id (e.g. "radiotedu-jazz") or "podcast:<id>".
  TrackPlayer.addEventListener(Event.RemotePlayId, async ({id}) => {
    try {
      await ensureBrowsableQueue(DEFAULT_STREAM_QUALITY);
      const played = await playTrackById(id);
      if (!played) {
        await playChannelById(id, DEFAULT_STREAM_QUALITY);
      }
      Analytics.carPlayback('android-auto', id);
    } catch (error) {
      console.log('[Playback] RemotePlayId failed:', error);
    }
  });

  // Voice / search ("Play RadioTEDU", "put on jazz").
  TrackPlayer.addEventListener(Event.RemotePlaySearch, async ({query}) => {
    try {
      const normalized = (query ?? '').trim().toLowerCase();
      if (normalized.includes('podcast')) {
        const playedPodcast = await playLatestPodcast();
        if (playedPodcast) {
          return;
        }
      }
      if (normalized.includes('jukebox')) {
        await playJukeboxVoiceAction();
        return;
      }
      const channel = findChannelByQuery(query ?? '');
      await playChannelById(channel.id, DEFAULT_STREAM_QUALITY);
      Analytics.carPlayback('android-auto', channel.id);
    } catch (error) {
      console.log('[Playback] RemotePlaySearch failed:', error);
    }
  });
};
