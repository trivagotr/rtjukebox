import TrackPlayer, {Event} from 'react-native-track-player';
import {
  ensureBrowsableQueue,
  findChannelByQuery,
  playChannelById,
  playTrackById,
} from './playbackQueue';
import {DEFAULT_STREAM_QUALITY} from './config';

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
    } catch (error) {
      console.log('[Playback] RemotePlayId failed:', error);
    }
  });

  // Voice / search ("Play RadioTEDU", "put on jazz").
  TrackPlayer.addEventListener(Event.RemotePlaySearch, async ({query}) => {
    try {
      const channel = findChannelByQuery(query ?? '');
      await playChannelById(channel.id, DEFAULT_STREAM_QUALITY);
    } catch (error) {
      console.log('[Playback] RemotePlaySearch failed:', error);
    }
  });
};
