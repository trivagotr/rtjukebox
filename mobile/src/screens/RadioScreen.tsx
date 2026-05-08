import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
} from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../theme/theme';
import api from '../services/api';
import {RADIO_CHANNELS, RadioChannel} from '../data/radioChannels';
import {useMetadata} from '../context/MetadataContext';
import {useChannels} from '../context/ChannelContext';
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';
import {
  buildFavoriteChannelOrder,
  loadFavoriteChannelIds,
  saveFavoriteChannelIds,
  toggleFavoriteChannelId,
} from '../services/radioFavorites';

const RadioScreen = () => {
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const {metadata, clearMetadata} = useMetadata();
  const {activeChannels, isChecking} = useChannels();
  const [selectedChannel, setSelectedChannel] = useState<RadioChannel>(RADIO_CHANNELS[0]);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [streamQuality, setStreamQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [currentVote, setCurrentVote] = useState<'up' | 'down' | null>(null);

  const state = playbackState?.state;
  const isPlaying = state === State.Playing && currentPlayingId === selectedChannel.id;
  const isBuffering =
    (state === State.Buffering || state === State.Loading) &&
    currentPlayingId === selectedChannel.id;

  const orderedChannels = useMemo(
    () => buildFavoriteChannelOrder(activeChannels, favoriteIds),
    [activeChannels, favoriteIds],
  );

  useEffect(() => {
    loadFavoriteChannelIds()
      .then(setFavoriteIds)
      .catch((error) => console.log('Failed to load radio favorites:', error));
  }, []);

  useEffect(() => {
    if (!isChecking && activeChannels.length > 0) {
      const isCurrentActive = activeChannels.find((channel) => channel.id === selectedChannel.id);
      if (!isCurrentActive) {
        setSelectedChannel(activeChannels[0]);
      }
    }
  }, [activeChannels, isChecking, selectedChannel.id]);

  useEffect(() => {
    if (activeTrack?.id && activeTrack.id !== selectedChannel.id) {
      const channel = activeChannels.find((item) => item.id === activeTrack.id);
      if (channel) {
        setSelectedChannel(channel);
      }
    }
  }, [activeTrack?.id, activeChannels, selectedChannel.id]);

  useEffect(() => {
    fetchHistory(selectedChannel.id);
    const interval = setInterval(() => fetchHistory(selectedChannel.id), 60000);
    return () => clearInterval(interval);
  }, [selectedChannel.id]);

  const fetchHistory = async (channelId: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await api.get(`/radio/history/${channelId}`);
      setHistory(response.data.data || []);
    } catch (error) {
      console.log('Failed to fetch history:', error);
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
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
    const channelIndex = RADIO_CHANNELS.findIndex((item) => item.id === channel.id);

    if (queue.length !== RADIO_CHANNELS.length) {
      await TrackPlayer.reset();
      const tracks = RADIO_CHANNELS.map((item) => {
        const quality = qualityOverride || streamQuality;
        return {
          id: item.id,
          url: resolveChannelUrl(item, quality),
          title: item.name,
          artist: item.description,
          artwork: item.logo || 'https://radiotedu.com/logo.png',
          isLiveStream: true,
        };
      });
      await TrackPlayer.add(tracks);
    } else if (isQualitySwitch) {
      const quality = qualityOverride || streamQuality;
      await TrackPlayer.remove(channelIndex);
      await TrackPlayer.add({
        id: channel.id,
        url: resolveChannelUrl(channel, quality),
        title: channel.name,
        artist: channel.description,
        artwork: channel.logo || 'https://radiotedu.com/logo.png',
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

  const skipToNextChannel = () => {
    const currentIndex = activeChannels.findIndex((channel) => channel.id === selectedChannel.id);
    const nextChannel = activeChannels[(currentIndex + 1) % activeChannels.length];
    if (nextChannel) {
      playChannel(nextChannel);
    }
  };

  const skipToPreviousChannel = () => {
    const currentIndex = activeChannels.findIndex((channel) => channel.id === selectedChannel.id);
    const previousIndex = currentIndex <= 0 ? activeChannels.length - 1 : currentIndex - 1;
    const previousChannel = activeChannels[previousIndex];
    if (previousChannel) {
      playChannel(previousChannel);
    }
  };

  const cycleQuality = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextQuality = streamQuality === 'high' ? 'low' : streamQuality === 'low' ? 'medium' : 'high';
    setStreamQuality(nextQuality);
    if (isPlaying || state === State.Buffering) {
      playChannel(selectedChannel, nextQuality);
    }
  };

  const toggleFavorite = async (channelId: string) => {
    const nextFavorites = toggleFavoriteChannelId(favoriteIds, channelId);
    setFavoriteIds(nextFavorites);
    try {
      await saveFavoriteChannelIds(nextFavorites);
    } catch (error) {
      console.log('Failed to save radio favorites:', error);
    }
  };

  const openHistory = () => {
    fetchHistory(selectedChannel.id);
    setShowHistoryModal(true);
  };

  const displayTitle = metadata?.title || activeTrack?.title || selectedChannel.name;
  const displayArtist = metadata?.artist || activeTrack?.artist || selectedChannel.description;
  const displayArtwork = metadata?.artwork || activeTrack?.artwork || selectedChannel.logo || 'https://radiotedu.com/logo.png';
  const qProps = getQualityProps(streamQuality);

  const renderHistoryItem = ({item}: {item: any}) => (
    <View style={styles.historyItem}>
      <Image
        source={{uri: item.cover_url || 'https://radiotedu.com/logo.png'}}
        style={styles.historyCover}
      />
      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.historyArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
      <Text style={styles.historyTime}>
        {new Date(item.played_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
      </Text>
    </View>
  );

  return (
    <PageTransition>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <GlobalHeader />

          <View style={styles.nowPlayingCard}>
            <Image source={{uri: displayArtwork}} style={styles.nowArtwork} />
            <View style={styles.nowBody}>
              <View style={styles.liveRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <TouchableOpacity style={[styles.qualityBadge, {borderColor: qProps.borderColor}]} onPress={cycleQuality}>
                  <Icon name={qProps.icon} size={13} color={qProps.color} />
                  <Text style={[styles.qualityText, {color: qProps.color}]}>{qProps.text}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.trackTitle} numberOfLines={1}>{displayTitle}</Text>
              <Text style={styles.trackArtist} numberOfLines={1}>{displayArtist}</Text>
            </View>
            <View style={styles.nowActions}>
              <TouchableOpacity style={styles.iconButton} onPress={openHistory}>
                <Icon name="history" size={20} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
                {isBuffering ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Icon name={isPlaying ? 'pause' : 'play'} size={25} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.transportRow}>
            <TouchableOpacity style={styles.transportButton} onPress={skipToPreviousChannel}>
              <Icon name="skip-previous" size={22} color={COLORS.textMuted} />
              <Text style={styles.transportText}>Önceki</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.votePill, currentVote === 'down' && styles.votePillActive]}
              onPress={() => setCurrentVote(currentVote === 'down' ? null : 'down')}>
              <Icon name={currentVote === 'down' ? 'thumb-down' : 'thumb-down-outline'} size={18} color={currentVote === 'down' ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.votePill, currentVote === 'up' && styles.votePillActive]}
              onPress={() => setCurrentVote(currentVote === 'up' ? null : 'up')}>
              <Icon name={currentVote === 'up' ? 'thumb-up' : 'thumb-up-outline'} size={18} color={currentVote === 'up' ? COLORS.success : COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.transportButton} onPress={skipToNextChannel}>
              <Text style={styles.transportText}>Sonraki</Text>
              <Icon name="skip-next" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Favoriler</Text>
              <Text style={styles.sectionMeta}>{orderedChannels.favorites.length} yayın</Text>
            </View>

            {orderedChannels.favorites.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoriteList}>
                {orderedChannels.favorites.map((channel) => (
                  <FavoriteCard
                    key={channel.id}
                    channel={channel}
                    isActive={selectedChannel.id === channel.id}
                    isPlaying={currentPlayingId === channel.id && state === State.Playing}
                    onPress={() => playChannel(channel)}
                    onToggleFavorite={() => toggleFavorite(channel.id)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyFavoriteCard}>
                <Icon name="heart-plus-outline" size={22} color={COLORS.primary} />
                <Text style={styles.emptyFavoriteText}>Sık dinlediğin yayınları favoriye ekle; burada hızlı erişim olarak kalacak.</Text>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tüm Yayınlar</Text>
              <Text style={styles.sectionMeta}>{activeChannels.length} aktif</Text>
            </View>

            <View style={styles.grid}>
              {[...orderedChannels.favorites, ...orderedChannels.remaining].map((channel) => (
                <ChannelGridCard
                  key={channel.id}
                  channel={channel}
                  isFavorite={favoriteIds.includes(channel.id)}
                  isActive={selectedChannel.id === channel.id}
                  isPlaying={currentPlayingId === channel.id && state === State.Playing}
                  onPress={() => playChannel(channel)}
                  onToggleFavorite={() => toggleFavorite(channel.id)}
                />
              ))}
            </View>
          </ScrollView>

          <HistoryModal
            visible={showHistoryModal}
            channel={selectedChannel}
            history={history}
            isLoading={isLoadingHistory}
            renderItem={renderHistoryItem}
            onClose={() => setShowHistoryModal(false)}
          />
        </SafeAreaView>
      </View>
    </PageTransition>
  );
};

function FavoriteCard({
  channel,
  isActive,
  isPlaying,
  onPress,
  onToggleFavorite,
}: {
  channel: RadioChannel;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.favoriteCard, isActive && {borderColor: channel.color}]}
      onPress={onPress}
      activeOpacity={0.82}>
      <View style={[styles.favoriteIcon, {backgroundColor: `${channel.color}22`}]}>
        <Icon name={channel.icon || 'radio-tower'} size={22} color={channel.color} />
      </View>
      <Text style={styles.favoriteName} numberOfLines={1}>{channel.name}</Text>
      <Text style={styles.favoriteDesc} numberOfLines={1}>{channel.description}</Text>
      {isPlaying ? <View style={[styles.equalizer, {backgroundColor: channel.color}]} /> : null}
      <TouchableOpacity style={styles.favoriteHeart} onPress={onToggleFavorite}>
        <Icon name="heart" size={18} color={COLORS.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function ChannelGridCard({
  channel,
  isFavorite,
  isActive,
  isPlaying,
  onPress,
  onToggleFavorite,
}: {
  channel: RadioChannel;
  isFavorite: boolean;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.channelCard, isActive && {borderColor: channel.color, backgroundColor: `${channel.color}18`}]}
      onPress={onPress}
      activeOpacity={0.84}>
      <View style={styles.cardTopRow}>
        <View style={[styles.channelIcon, {backgroundColor: `${channel.color}22`}]}>
          <Icon name={channel.icon || 'radio-tower'} size={20} color={channel.color} />
        </View>
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={{top: 8, right: 8, bottom: 8, left: 8}}>
          <Icon name={isFavorite ? 'heart' : 'heart-outline'} size={19} color={isFavorite ? COLORS.primary : COLORS.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
      <Text style={styles.channelDescription} numberOfLines={1}>{channel.description}</Text>
      <View style={styles.cardBottomRow}>
        <Text style={[styles.statusText, isPlaying && {color: channel.color}]}>
          {isPlaying ? 'Çalıyor' : 'Dinle'}
        </Text>
        <Icon name={isPlaying ? 'volume-high' : 'play-circle-outline'} size={18} color={isPlaying ? channel.color : COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function HistoryModal({
  visible,
  channel,
  history,
  isLoading,
  renderItem,
  onClose,
}: {
  visible: boolean;
  channel: RadioChannel;
  history: any[];
  isLoading: boolean;
  renderItem: ({item}: {item: any}) => React.ReactElement;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.historyModalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.headerInfo}>
              <Text style={styles.modalTitle}>Son Çalan Şarkılar</Text>
              <Text style={styles.modalSubtitle}>{channel.name} · Son 15 Dakika</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Icon name="close-circle" size={28} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoading && history.length === 0 ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : history.length > 0 ? (
            <FlatList
              data={history}
              renderItem={renderItem}
              keyExtractor={(item, index) => item.id || index.toString()}
              contentContainerStyle={styles.historyFlatList}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyHistoryContainer}>
              <Icon name="clock-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.noHistoryText}>Henüz geçmiş kaydı bulunmuyor.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function resolveChannelUrl(channel: RadioChannel, quality: 'low' | 'medium' | 'high') {
  if (quality === 'low' && channel.streams?.low) {
    return channel.streams.low;
  }
  if (quality === 'medium' && channel.streams?.medium) {
    return channel.streams.medium;
  }
  if (quality === 'high' && channel.streams?.high) {
    return channel.streams.high;
  }
  return channel.streamUrl;
}

function getQualityProps(streamQuality: 'low' | 'medium' | 'high') {
  if (streamQuality === 'high') {
    return {text: 'HQ', color: '#FFD700', borderColor: 'rgba(255, 215, 0, 0.5)', icon: 'signal-cellular-3'};
  }
  if (streamQuality === 'medium') {
    return {text: 'MQ', color: '#00BCD4', borderColor: 'rgba(0, 188, 212, 0.5)', icon: 'signal-cellular-2'};
  }
  return {text: 'LQ', color: '#B0BEC5', borderColor: 'rgba(176, 190, 197, 0.5)', icon: 'signal-cellular-1'};
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 24,
    backgroundColor: '#211113',
    borderWidth: 1,
    borderColor: 'rgba(227,30,36,0.28)',
  },
  nowArtwork: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  nowBody: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 5,
  },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  qualityText: {
    fontSize: 9,
    fontWeight: '900',
  },
  trackTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },
  trackArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  nowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  transportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    height: 38,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  transportText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  votePill: {
    width: 42,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  votePillActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  favoriteList: {
    gap: SPACING.sm,
  },
  favoriteCard: {
    width: 148,
    minHeight: 118,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  favoriteIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: SPACING.sm,
  },
  favoriteDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  favoriteHeart: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  equalizer: {
    position: 'absolute',
    left: SPACING.md,
    bottom: 10,
    width: 34,
    height: 4,
    borderRadius: 999,
  },
  emptyFavoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyFavoriteText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  channelCard: {
    width: '48%',
    minHeight: 124,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: SPACING.sm,
  },
  channelDescription: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
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
    borderColor: COLORS.border,
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
