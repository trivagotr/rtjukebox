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
  useWindowDimensions,
  ScrollView,
  Modal,
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
import api from '../services/api';
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
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  // Fetch History Logic
  const fetchHistory = async (channelId: string) => {
    try {
      setIsLoadingHistory(true);
      // Backend endpoint: /api/v1/radio/history/:channel_id
      const response = await api.get(`/radio/history/${channelId}`);
      setHistory(response.data.data || []);
    } catch (error) {
      console.log('Failed to fetch history:', error);
      // Fallback/Mock for now if backend is not ready
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory(selectedChannel.id);

    // Auto refresh history every 60 seconds
    const interval = setInterval(() => {
      fetchHistory(selectedChannel.id);
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedChannel.id]);

  const openHistory = () => {
    fetchHistory(selectedChannel.id);
    setShowHistoryModal(true);
  };

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

    const queue = await TrackPlayer.getQueue();
    const channelIndex = RADIO_CHANNELS.findIndex(c => c.id === channel.id);

    // If queue is empty or significantly different, repopulate
    if (queue.length !== RADIO_CHANNELS.length) {
      await TrackPlayer.reset();
      const tracks = RADIO_CHANNELS.map(c => {
        let url = c.streamUrl;
        const quality = qualityOverride || streamQuality;
        if (c.streams) {
          if (quality === 'low' && c.streams.low) url = c.streams.low;
          else if (quality === 'medium' && c.streams.medium) url = c.streams.medium;
          else if (quality === 'high' && c.streams.high) url = c.streams.high;
        }
        return {
          id: c.id,
          url: url,
          title: c.name,
          artist: c.description,
          artwork: 'https://radiotedu.com/logo.png',
          isLiveStream: true,
        };
      });
      await TrackPlayer.add(tracks);
    } else if (isQualitySwitch) {
      // Update the Specific track in queue if quality changed
      let url = channel.streamUrl;
      const quality = qualityOverride || streamQuality;
      if (channel.streams) {
        if (quality === 'low' && channel.streams.low) url = channel.streams.low;
        else if (quality === 'medium' && channel.streams.medium) url = channel.streams.medium;
        else if (quality === 'high' && channel.streams.high) url = channel.streams.high;
      }

      // Since it's a live stream, we actually need to replace or re-add to refresh the buffer with new URL
      // But for simplicity in AA, we'll just skip to it. 
      // Actually, to change URL we must update the track.
      await TrackPlayer.remove(channelIndex);
      await TrackPlayer.add({
        id: channel.id,
        url: url,
        title: channel.name,
        artist: channel.description,
        artwork: 'https://radiotedu.com/logo.png',
        isLiveStream: true,
      }, channelIndex);
    }

    await TrackPlayer.skip(channelIndex);
    await TrackPlayer.play();
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
          ]}
          maxFontSizeMultiplier={1.1}>
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

  const renderHistoryItem = ({ item }: { item: any }) => (
    <View style={styles.historyItem}>
      <Image
        source={{ uri: item.cover_url || 'https://radiotedu.com/logo.png' }}
        style={styles.historyCover}
      />
      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.historyArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
      <Text style={styles.historyTime}>
        {new Date(item.played_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );

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

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
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
                  <Text
                    style={styles.trackTitle}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}>
                    {displayTitle}
                  </Text>
                  <Text
                    style={styles.trackArtist}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}>
                    {displayArtist}
                  </Text>
                </View>

                <View style={styles.badgesRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText} maxFontSizeMultiplier={1.1}>
                      LIVE
                    </Text>
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
                    <Text
                      style={[styles.techBadgeText, { color: qProps.color }]}
                      maxFontSizeMultiplier={1.1}>
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

                {/* History Trigger Button */}
                <TouchableOpacity
                  style={styles.historyTrigger}
                  onPress={openHistory}
                  activeOpacity={0.7}
                >
                  <Icon name="history" size={20} color={COLORS.primary} />
                  <Text style={styles.historyTriggerText}>Son Çalanları Gör</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* History Modal */}
            <Modal
              visible={showHistoryModal}
              animationType="slide"
              transparent={true}
              onRequestClose={() => setShowHistoryModal(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.historyModalContent}>
                  <View style={styles.modalHandle} />

                  <View style={styles.modalHeader}>
                    <View style={styles.headerInfo}>
                      <Text style={styles.modalTitle}>Son Çalan Şarkılar</Text>
                      <Text style={styles.modalSubtitle}>{selectedChannel.name} • Son 15 Dakika</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowHistoryModal(false)}
                      style={styles.modalCloseButton}
                    >
                      <Icon name="close-circle" size={28} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {isLoadingHistory && history.length === 0 ? (
                    <View style={styles.modalLoading}>
                      <ActivityIndicator color={COLORS.primary} size="large" />
                    </View>
                  ) : history.length > 0 ? (
                    <FlatList
                      data={history}
                      renderItem={renderHistoryItem}
                      keyExtractor={(item, index) => item.id || index.toString()}
                      contentContainerStyle={styles.historyFlatList}
                      showsVerticalScrollIndicator={false}
                    />
                  ) : (
                    <View style={styles.emptyHistoryContainer}>
                      <Icon name="clock-outline" size={48} color={COLORS.surface} />
                      <Text style={styles.noHistoryText}>Henüz geçmiş kaydı bulunmuyor.</Text>
                    </View>
                  )}
                </View>
              </View>
            </Modal>
          </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  artworkContainer: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    marginBottom: 20,
  },
  artwork: {
    width: 280,
    height: 280,
    maxWidth: '85%',
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  trackTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  trackArtist: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
    opacity: 0.9,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
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
    gap: 24,
    marginBottom: 16,
  },
  voteButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    gap: 24,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
  // History UI Improvements
  historyTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  historyTriggerText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  historyModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerInfo: {
    flex: 1,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
  },
  historyFlatList: {
    paddingBottom: 20,
    gap: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyCover: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#333',
  },
  historyInfo: {
    flex: 1,
    marginLeft: 14,
  },
  historyTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  historyArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  historyTime: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalLoading: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHistoryContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noHistoryText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
});

export default RadioScreen;
