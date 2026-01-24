import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, {
  State,
  usePlaybackState,
  useActiveTrack,
} from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING } from '../theme/theme';
import { RADIO_CHANNELS, RadioChannel } from '../data/radioChannels';
import { useMetadata } from '../context/MetadataContext';
import { useChannels } from '../context/ChannelContext';
import { useAuth } from '../context/AuthContext';
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';

const RadioScreen = () => {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const { metadata, clearMetadata } = useMetadata();
  const { activeChannels, isChecking } = useChannels();
  const [selectedChannel, setSelectedChannel] = useState<RadioChannel>(
    RADIO_CHANNELS[0],
  );
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecking && activeChannels.length > 0) {
      const isCurrentActive = activeChannels.find(
        c => c.id === selectedChannel.id,
      );
      if (!isCurrentActive) {
        setSelectedChannel(activeChannels[0]);
      }
    }
  }, [activeChannels, isChecking]);

  const [streamQuality, setStreamQuality] = useState<'low' | 'medium' | 'high'>(
    'high',
  );

  const [currentVote, setCurrentVote] = useState<'up' | 'down' | null>(null);

  const state = playbackState?.state;
  const isPlaying =
    state === State.Playing && currentPlayingId === selectedChannel.id;
  const isBuffering =
    (state === State.Buffering || state === State.Loading) &&
    currentPlayingId === selectedChannel.id;

  useEffect(() => {
    if (Platform.OS === 'android') {
      if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
    }
  }, []);

  useEffect(() => {
    if (
      activeTrack &&
      activeTrack.id &&
      activeTrack.id !== selectedChannel.id
    ) {
      const channel = activeChannels.find(c => c.id === activeTrack.id);
      if (channel) {
        setSelectedChannel(channel);
      }
    }
  }, [activeTrack?.id, activeChannels]);

  const playChannel = async (
    channel: RadioChannel,
    qualityOverride?: 'low' | 'medium' | 'high',
  ) => {
    const isQualitySwitch =
      channel.id === selectedChannel.id &&
      qualityOverride &&
      qualityOverride !== streamQuality;

    setSelectedChannel(channel);
    if (!isQualitySwitch) {
      clearMetadata();
    }

    let url = channel.streamUrl;
    if (channel.streams) {
      const quality = qualityOverride || streamQuality;
      if (quality === 'low' && channel.streams.low) {
        url = channel.streams.low;
      } else if (quality === 'medium' && channel.streams.medium) {
        url = channel.streams.medium;
      } else if (quality === 'high' && channel.streams.high) {
        url = channel.streams.high;
      }
    }

    const trackObject = {
      id: channel.id,
      url: url,
      title: channel.name,
      artist: channel.description,
      artwork: 'https://radiotedu.com/logo.png',
      isLiveStream: true,
    };

    if (isQualitySwitch) {
      await TrackPlayer.add(trackObject);
      await TrackPlayer.skipToNext();
    } else {
      await TrackPlayer.reset();
      await TrackPlayer.add(trackObject);
      await TrackPlayer.play();
    }

    setCurrentPlayingId(channel.id);
  };

  const togglePlayback = async () => {
    const currentState = await TrackPlayer.getState();
    if (currentState === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await playChannel(selectedChannel);
    }
  };

  const selectChannel = (channel: RadioChannel) => {
    playChannel(channel);
  };

  const skipToNextChannel = () => {
    const currentIndex = activeChannels.findIndex(
      c => c.id === selectedChannel.id,
    );
    const nextIndex = (currentIndex + 1) % activeChannels.length;
    const nextChannel = activeChannels[nextIndex];
    playChannel(nextChannel);
  };

  const skipToPreviousChannel = () => {
    const currentIndex = activeChannels.findIndex(
      c => c.id === selectedChannel.id,
    );
    const prevIndex =
      currentIndex === 0 ? activeChannels.length - 1 : currentIndex - 1;
    const prevChannel = activeChannels[prevIndex];
    playChannel(prevChannel);
  };

  const cycleQuality = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    let nextQuality: 'low' | 'medium' | 'high';
    if (streamQuality === 'high') {
      nextQuality = 'low';
    } else if (streamQuality === 'low') {
      nextQuality = 'medium';
    } else {
      nextQuality = 'high';
    }
    setStreamQuality(nextQuality);
    if (isPlaying || state === State.Buffering) {
      playChannel(selectedChannel, nextQuality);
    }
  };

  const displayTitle =
    metadata?.title || activeTrack?.title || selectedChannel.name;
  const displayArtist =
    metadata?.artist || activeTrack?.artist || selectedChannel.description;
  const displayArtwork = metadata?.artwork || activeTrack?.artwork;
  const hasArtwork =
    displayArtwork && displayArtwork !== 'https://radiotedu.com/logo.png';

  const getQualityProps = () => {
    switch (streamQuality) {
      case 'high':
        return {
          text: 'HQ • 320kbps',
          color: '#FFD700',
          borderColor: 'rgba(255, 215, 0, 0.5)',
          bg: 'rgba(255, 215, 0, 0.1)',
          icon: 'signal-cellular-3',
        };
      case 'medium':
        return {
          text: 'MQ • 128kbps',
          color: '#00BCD4',
          borderColor: 'rgba(0, 188, 212, 0.5)',
          bg: 'rgba(0, 188, 212, 0.1)',
          icon: 'signal-cellular-2',
        };
      default:
        return {
          text: 'LQ • 64kbps',
          color: '#B0BEC5',
          borderColor: 'rgba(176, 190, 197, 0.5)',
          bg: 'rgba(176, 190, 197, 0.1)',
          icon: 'signal-cellular-1',
        };
    }
  };

  const qProps = getQualityProps();

  const renderChannelItem = ({ item }: { item: RadioChannel }) => {
    const isActive = selectedChannel.id === item.id;
    const isChannelPlaying =
      currentPlayingId === item.id && state === State.Playing;

    return (
      <TouchableOpacity
        style={[styles.channelChip, isActive && { backgroundColor: item.color }]}
        onPress={() => selectChannel(item)}
        activeOpacity={0.7}>
        <View
          style={[
            styles.channelDot,
            { backgroundColor: isActive ? '#fff' : item.color },
          ]}
        />
        <Text
          style={[
            styles.channelChipText,
            isActive && styles.channelChipTextActive,
          ]}>
          {item.name}
        </Text>
        {isChannelPlaying && (
          <Icon
            name="volume-high"
            size={14}
            color={isActive ? '#fff' : item.color}
            style={{ marginLeft: 4 }}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <PageTransition>
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]}>
          {hasArtwork && (
            <ImageBackground
              source={{ uri: displayArtwork }}
              style={styles.backgroundImage}
              blurRadius={50}>
              <View style={styles.backgroundOverlay} />
            </ImageBackground>
          )}
        </View>

        <SafeAreaView style={styles.safeArea}>
          <GlobalHeader />

          {/* Logo Banner - Removed for a cleaner look as per premium preference */}

          <View style={styles.channelSection}>
            <FlatList
              data={activeChannels}
              renderItem={renderChannelItem}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.channelList}
            />
          </View>

          <View style={styles.playerArea}>
            <View style={styles.artworkSection}>
              <View style={styles.artworkContainer}>
                {hasArtwork ? (
                  <Image source={{ uri: displayArtwork }} style={styles.artwork} />
                ) : (
                  <Image
                    source={{ uri: 'https://radiotedu.com/logo.png' }}
                    style={styles.artwork}
                  />
                )}
              </View>
            </View>

            <View style={styles.controlsSection}>
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {displayTitle}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {displayArtist}
                </Text>
              </View>

              <View style={styles.badgesRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>

                <TouchableOpacity
                  onPress={cycleQuality}
                  style={[
                    styles.techBadge,
                    {
                      borderColor: qProps.borderColor,
                      backgroundColor: qProps.bg,
                    },
                  ]}
                  activeOpacity={0.7}>
                  <Icon
                    name={qProps.icon}
                    size={14}
                    color={qProps.color}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.techBadgeText, { color: qProps.color }]}>
                    {qProps.text}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.votingRow}>
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    currentVote === 'down' && styles.voteButtonActive,
                  ]}
                  onPress={() => {
                    setCurrentVote(currentVote === 'down' ? null : 'down');
                  }}>
                  <Icon
                    name={
                      currentVote === 'down' ? 'thumb-down' : 'thumb-down-outline'
                    }
                    size={24}
                    color={currentVote === 'down' ? COLORS.primary : '#888'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    currentVote === 'up' && styles.voteButtonActive,
                  ]}
                  onPress={() => {
                    setCurrentVote(currentVote === 'up' ? null : 'up');
                  }}>
                  <Icon
                    name={currentVote === 'up' ? 'thumb-up' : 'thumb-up-outline'}
                    size={24}
                    color={currentVote === 'up' ? '#4CAF50' : '#888'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.controls}>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={skipToPreviousChannel}>
                  <Icon name="skip-previous" size={36} color="#b3b3b3" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playButton}
                  onPress={togglePlayback}>
                  {isBuffering ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <Icon
                      name={isPlaying ? 'pause' : 'play'}
                      size={36}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={skipToNextChannel}>
                  <Icon name="skip-next" size={36} color="#b3b3b3" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </PageTransition>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    opacity: 0.4,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  safeArea: {
    flex: 1,
  },
  channelSection: {
    marginBottom: 8,
    marginTop: 8,
  },
  channelList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  channelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  channelChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  channelChipTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  playerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginVertical: 10,
  },
  artworkSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  artworkContainer: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    marginBottom: 20,
  },
  artwork: {
    width: 280,
    height: 280,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  trackTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  trackArtist: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.9,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  techBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  techBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium',
  },
  votingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    marginBottom: 32,
  },
  voteButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  voteButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  controlButton: {
    padding: 12,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});

export default RadioScreen;
