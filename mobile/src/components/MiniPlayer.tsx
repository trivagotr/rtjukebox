import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import TrackPlayer, {
  usePlaybackState,
  State,
  useActiveTrack,
  useTrackPlayerEvents,
  Event,
} from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS} from '../theme/theme';
import {useNavigation, useNavigationState} from '@react-navigation/native';
import {fetchAlbumArtwork} from '../utils/api';
import {RADIO_CHANNELS} from '../data/radioChannels';
import {playChannelById} from '../services/playbackQueue';
import {DEFAULT_STREAM_QUALITY} from '../services/config';
import {useMetadata} from '../context/MetadataContext';
import {useChannels} from '../context/ChannelContext';

const MiniPlayer = () => {
  const playbackState = usePlaybackState();
  const track = useActiveTrack();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {metadata, updateMetadata} = useMetadata();
  const {activeChannels} = useChannels();
  const [isChangingChannel, setIsChangingChannel] = React.useState(false);

  // More robust detection: check if Radio tab is currently active
  const isOnRadioTab = useNavigationState(state => {
    if (!state) {
      return false;
    }
    try {
      const stackRoute = state.routes[state.index] as any;
      if (stackRoute.name === 'Profile') {
        return false;
      }

      if (stackRoute.state && stackRoute.state.index !== undefined) {
        const tabState = stackRoute.state;
        const activeTab = tabState.routes[tabState.index];
        return activeTab?.name === 'Radio';
      }

      return false;
    } catch {
      return false;
    }
  });

  const isOnProfileScreen = useNavigationState(state => {
    if (!state) {
      return false;
    }
    const route = state.routes[state.index] as any;
    return route.name === 'Profile';
  });

  const state = playbackState?.state;
  const isPlaying = state === State.Playing;

  // --- Metadata Management Logic ---
  useTrackPlayerEvents([Event.PlaybackMetadataReceived], async event => {
    console.log(
      '[MiniPlayer] PlaybackMetadataReceived event:',
      JSON.stringify(event),
    );
    if (event.type === Event.PlaybackMetadataReceived) {
      const {title, artist} = event;
      const currentTrackData = await TrackPlayer.getActiveTrack();
      console.log(
        '[MiniPlayer] Parsed metadata - title:',
        title,
        'artist:',
        artist,
      );

      if (currentTrackData?.id && title) {
        const channel = RADIO_CHANNELS.find(c => c.id === currentTrackData.id);
        const stationName = channel?.name || 'RadioTEDU';

        let songTitle = title;
        let songArtist = artist || stationName;
        let artworkUrl = 'https://radiotedu.com/logo.png';

        // Parse "Artist - Title"
        if (!artist && title.includes(' - ')) {
          const parts = title.split(' - ');
          if (parts.length >= 2) {
            songArtist = parts[0].trim();
            songTitle = parts[1].trim();
          }
        }

        // Fetch artwork
        const fetchedArtwork = await fetchAlbumArtwork(
          `${songArtist} ${songTitle}`,
        );
        if (fetchedArtwork) {
          artworkUrl = fetchedArtwork;
        }

        // Update Context State (triggers re-render)
        updateMetadata({
          title: songTitle,
          artist: songArtist,
          artwork: artworkUrl,
        });

        // Update TrackPlayer for notification/lock screen
        const currentTrackIndex = await TrackPlayer.getActiveTrackIndex();
        if (currentTrackIndex !== undefined) {
          await TrackPlayer.updateMetadataForTrack(currentTrackIndex, {
            title: songTitle,
            artist: songArtist,
            artwork: artworkUrl,
          });
        }
      }
    }
  });
  // --------------------------------

  const [lastTrack, setLastTrack] = React.useState<any>(null);

  // Keep lastTrack updated whenever we have a valid track
  React.useEffect(() => {
    if (track) {
      setLastTrack(track);
    }
  }, [track]);

  // Use active track OR fallback to last known track to prevent flicker
  const displayTrack = track || lastTrack;

  // Simplified visibility: Show if we have ANY track info (current or last known)
  // Only hide on specific screens.
  if (
    (!displayTrack && !isChangingChannel) ||
    isOnProfileScreen ||
    isOnRadioTab
  ) {
    return null;
  }

  const skipToPrevious = async () => {
    if (activeChannels.length === 0) {
      return;
    }

    console.log(
      '[MiniPlayer] skipToPrevious called. TrackID:',
      displayTrack?.id,
    );

    let prevIndex = activeChannels.length - 1; // Default to last channel

    if (displayTrack?.id) {
      const currentIndex = activeChannels.findIndex(
        c => c.id === displayTrack.id,
      );
      if (currentIndex !== -1) {
        prevIndex =
          (currentIndex - 1 + activeChannels.length) % activeChannels.length;
      } else {
        console.log(
          '[MiniPlayer] Current track not in active list, defaulting to last active.',
        );
      }
    } else {
      console.log(
        '[MiniPlayer] No active track ID, defaulting to last active.',
      );
    }

    const prevChannel = activeChannels[prevIndex];
    console.log('[MiniPlayer] Skipping to:', prevChannel.name);

    try {
      setIsChangingChannel(true);
      // Play within the existing browsable queue so the car browse list and
      // notification controls stay intact (no full reset).
      await playChannelById(prevChannel.id, DEFAULT_STREAM_QUALITY);
    } catch (error) {
      console.log('Skip error:', error);
    } finally {
      setTimeout(() => setIsChangingChannel(false), 500);
    }
  };

  const skipToNext = async () => {
    if (activeChannels.length === 0) {
      return;
    }

    console.log('[MiniPlayer] skipToNext called. TrackID:', displayTrack?.id);

    let nextIndex = 0; // Default to first channel

    if (displayTrack?.id) {
      const currentIndex = activeChannels.findIndex(
        c => c.id === displayTrack.id,
      );
      if (currentIndex !== -1) {
        nextIndex = (currentIndex + 1) % activeChannels.length;
      } else {
        console.log(
          '[MiniPlayer] Current track not in active list, defaulting to first active.',
        );
      }
    } else {
      console.log(
        '[MiniPlayer] No active track ID, defaulting to first active.',
      );
    }

    const nextChannel = activeChannels[nextIndex];
    console.log('[MiniPlayer] Skipping to:', nextChannel.name);

    try {
      setIsChangingChannel(true);
      // Play within the existing browsable queue so the car browse list and
      // notification controls stay intact (no full reset).
      await playChannelById(nextChannel.id, DEFAULT_STREAM_QUALITY);
    } catch (error) {
      console.log('Skip error:', error);
    } finally {
      setTimeout(() => setIsChangingChannel(false), 500);
    }
  };

  const isBuffering = state === State.Buffering || state === State.Connecting;

  const togglePlayback = async () => {
    if (state === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  // Use context metadata if available, fallback to track data (or last known track)
  const displayTitle = metadata?.title || displayTrack?.title;
  const displayArtist = metadata?.artist || displayTrack?.artist;
  const displayArtwork = metadata?.artwork || displayTrack?.artwork;

  return (
    <View style={[styles.container, {bottom: insets.bottom + 78}]}>
      <View style={styles.content}>
        <View style={styles.artworkContainer}>
          {displayArtwork &&
          displayArtwork !== 'https://radiotedu.com/logo.png' ? (
            <Image source={{uri: displayArtwork}} style={styles.artwork} />
          ) : (
            <Image
              source={{uri: 'https://radiotedu.com/logo.png'}}
              style={styles.artwork}
            />
          )}
        </View>

        <TouchableOpacity
          style={styles.infoContainer}
          onPress={() => navigation.navigate('Player')}>
          <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {displayTitle}
          </Text>
          <Text style={styles.artist} numberOfLines={1} maxFontSizeMultiplier={1.1}>
            {displayArtist}
          </Text>
        </TouchableOpacity>

        <View style={styles.controls}>
          <TouchableOpacity onPress={skipToPrevious} style={styles.iconButton}>
            <Icon name="skip-previous" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
            {isBuffering ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color="#fff"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={skipToNext} style={styles.iconButton}>
            <Icon name="skip-next" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#211113',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(227, 30, 36, 0.24)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artworkContainer: {
    marginRight: 12,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  placeholderArtwork: {
    backgroundColor: '#404040',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    color: '#b3b3b3',
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
});

export default MiniPlayer;
