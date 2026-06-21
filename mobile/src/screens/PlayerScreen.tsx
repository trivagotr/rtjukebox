import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
} from 'react-native-track-player';
import {COLORS, SPACING} from '../theme/theme';
import {RADIO_CHANNELS, RadioChannel} from '../data/radioChannels';
import {DEFAULT_STREAM_QUALITY} from '../services/config';
import {isPodcastId, playChannelById} from '../services/playbackQueue';
import {
  loadFavoriteChannelIds,
  saveFavoriteChannelIds,
  toggleFavoriteChannelId,
} from '../services/radioFavorites';
import {useMetadata} from '../context/MetadataContext';
import {useChannels} from '../context/ChannelContext';

const FALLBACK_ARTWORK = 'https://radiotedu.com/logo.png';
const {width: SCREEN_WIDTH} = Dimensions.get('window');
const ART_SIZE = Math.min(SCREEN_WIDTH - SPACING.lg * 4, 340);

/**
 * Full-screen, Spotify-style "now playing" view: a large album-art hero with
 * the song + artist beneath it and the transport controls. Opened from the
 * radio list / mini player. Reads live state from react-native-track-player and
 * the ICY metadata context, so it follows whatever is actually playing
 * (a station or a podcast episode).
 */
const PlayerScreen = () => {
  const navigation = useNavigation<any>();
  const activeTrack = useActiveTrack();
  const playbackState = usePlaybackState();
  const {metadata} = useMetadata();
  const {activeChannels} = useChannels();

  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    loadFavoriteChannelIds()
      .then(setFavoriteIds)
      .catch(() => {});
  }, []);

  const channelList = activeChannels.length ? activeChannels : RADIO_CHANNELS;

  // The station currently playing (null when a podcast is playing).
  const currentChannel: RadioChannel | undefined = useMemo(() => {
    if (!activeTrack?.id || isPodcastId(activeTrack.id)) {
      return undefined;
    }
    return channelList.find(c => c.id === activeTrack.id);
  }, [activeTrack?.id, channelList]);

  const state = playbackState?.state;
  const isPlaying = state === State.Playing;
  const isBuffering = state === State.Buffering || state === State.Loading;

  const displayArtwork =
    metadata?.artwork ||
    (activeTrack?.artwork as string) ||
    currentChannel?.logo ||
    FALLBACK_ARTWORK;
  const displayTitle =
    metadata?.title || activeTrack?.title || currentChannel?.name || 'RadioTEDU';
  const displayArtist =
    metadata?.artist ||
    (activeTrack?.artist as string) ||
    currentChannel?.description ||
    'RadioTEDU';

  const isLive = !!currentChannel || (!!activeTrack && !isPodcastId(activeTrack.id));

  // The heart reflects the CURRENT station's favorite state, so it updates
  // automatically when the station/song changes (no stuck "liked" state).
  const isFavorite = currentChannel
    ? favoriteIds.includes(currentChannel.id)
    : false;

  const togglePlayback = async () => {
    const {state: current} = await TrackPlayer.getPlaybackState();
    if (current === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  const goToOffset = async (delta: number) => {
    if (currentChannel) {
      const idx = channelList.findIndex(c => c.id === currentChannel.id);
      const base = idx === -1 ? 0 : idx;
      const next =
        channelList[(base + delta + channelList.length) % channelList.length];
      if (next) {
        await playChannelById(next.id, DEFAULT_STREAM_QUALITY).catch(() => {});
      }
      return;
    }
    // Podcast / queue item: step within the player queue.
    try {
      if (delta > 0) {
        await TrackPlayer.skipToNext();
      } else {
        await TrackPlayer.skipToPrevious();
      }
    } catch {
      // start/end of queue — ignore
    }
  };

  const toggleFavorite = async () => {
    if (!currentChannel) {
      return;
    }
    const next = toggleFavoriteChannelId(favoriteIds, currentChannel.id);
    setFavoriteIds(next);
    saveFavoriteChannelIds(next).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      {/* Soft brand tint behind the art, like Spotify's gradient header. */}
      <View
        style={[
          styles.tint,
          {backgroundColor: currentChannel?.color || COLORS.primary},
        ]}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.topButton}
            accessibilityLabel="Kapat">
            <Icon name="chevron-down" size={30} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.topLabel} numberOfLines={1}>
            {isLive ? 'CANLI YAYIN' : 'ÇALIYOR'}
          </Text>
          <View style={styles.topButton} />
        </View>

        <View style={styles.artWrap}>
          <Image
            source={{uri: displayArtwork}}
            style={styles.art}
            resizeMode="cover"
          />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaText}>
            <Text style={styles.title} numberOfLines={2}>
              {displayTitle}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {displayArtist}
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggleFavorite}
            disabled={!currentChannel}
            style={styles.heartButton}
            accessibilityLabel={isFavorite ? 'Favoriden çıkar' : 'Favoriye ekle'}>
            <Icon
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={28}
              color={isFavorite ? COLORS.primary : COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>

        {isLive ? (
          <View style={styles.liveRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.liveBar}>
              <View style={styles.liveBarFill} />
            </View>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={() => goToOffset(-1)}
            style={styles.sideButton}
            accessibilityLabel="Önceki">
            <Icon name="skip-previous" size={40} color={COLORS.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlayback}
            style={styles.playButton}
            accessibilityLabel={isPlaying ? 'Duraklat' : 'Oynat'}>
            {isBuffering ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Icon
                name={isPlaying ? 'pause' : 'play'}
                size={40}
                color="#fff"
                style={!isPlaying && {marginLeft: 3}}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => goToOffset(1)}
            style={styles.sideButton}
            accessibilityLabel="Sonraki">
            <Icon name="skip-next" size={40} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    opacity: 0.18,
  },
  safe: {flex: 1, paddingHorizontal: SPACING.lg},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  topButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  topLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  art: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  metaText: {flex: 1, paddingRight: SPACING.md},
  title: {color: COLORS.text, fontSize: 24, fontWeight: '900', lineHeight: 30},
  artist: {color: COLORS.textMuted, fontSize: 16, marginTop: 6},
  heartButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRow: {flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xl, gap: SPACING.sm},
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(227,30,36,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary},
  liveText: {color: COLORS.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1},
  liveBar: {flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden'},
  liveBarFill: {width: '100%', height: '100%', backgroundColor: COLORS.primary, opacity: 0.5},
  spacer: {height: SPACING.xl},
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.xl,
  },
  sideButton: {width: 56, height: 56, alignItems: 'center', justifyContent: 'center'},
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PlayerScreen;
