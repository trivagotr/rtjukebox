import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import {
  fetchPodcasts,
  fetchSpotifyUrl,
  Podcast,
} from '../services/podcastService';
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';

const PodcastScreen = () => {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadPodcasts(1);
  }, []);

  const loadPodcasts = async (pageToLoad: number, append: boolean = false) => {
    if (pageToLoad === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await fetchPodcasts(pageToLoad);

      if (data.length < 8) { // Assuming 8 is our limit per page
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (append) {
        setPodcasts(prev => [...prev, ...data]);
      } else {
        setPodcasts(data);
      }
      setPage(pageToLoad);
    } catch (e) {
      console.log('Failed to fetch podcasts', e);
      Alert.alert('Hata', 'Podcast listesi alınamadı.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadPodcasts(page + 1, true);
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    await loadPodcasts(1, false);
    setRefreshing(false);
  };

  const handlePodcastPress = async (podcast: Podcast) => {
    if (playingId === podcast.id) {
      return;
    }

    setPlayingId(podcast.id);

    try {
      // Direct Audio Playback for RSS sources
      if (podcast.source === 'rss' && podcast.audioUrl) {
        const urlToOpen = podcast.spotifyUrl || podcast.audioUrl || podcast.url;
        if (urlToOpen) {
          await Linking.openURL(urlToOpen);
        }
        return;
      }

      // Existing Scraper Logic
      let url = podcast.spotifyUrl;

      if (!url) {
        const fetchedUrl = await fetchSpotifyUrl(podcast.url);
        if (fetchedUrl) {
          url = fetchedUrl;
          setPodcasts(prev =>
            prev.map(p => (p.id === podcast.id ? { ...p, spotifyUrl: url } : p)),
          );
        } else {
          url = podcast.url;
        }
      }

      if (url) {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          Alert.alert('Hata', 'Bu bağlantı açılamıyor: ' + url);
        }
      }
    } catch (error) {
      console.error('Error opening podcast:', error);
      Alert.alert('Hata', 'Podcast açılırken bir sorun oluştu.');
    } finally {
      setPlayingId(null);
    }
  };

  const renderFooter = () => {
    if (!hasMore) return <View style={{ height: 40 }} />;

    return (
      <View style={styles.footerContainer}>
        {loadingMore ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
            <Text style={styles.loadMoreText}>Daha Fazla Yükle</Text>
            <Icon name="chevron-down" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: Podcast }) => (
    <TouchableOpacity
      style={styles.podcastItem}
      onPress={() => handlePodcastPress(item)}
      activeOpacity={0.7}
      disabled={playingId === item.id}>
      <View style={styles.podcastIcon}>
        <Icon
          name={item.source === 'rss' ? 'rss' : 'microphone-variant'}
          size={24}
          color={COLORS.primary}
        />
      </View>
      <View style={styles.podcastInfo}>
        <Text style={styles.podcastTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.podcastDate}>{item.date}</Text>
        <Text style={styles.podcastDescription} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      <View style={styles.actionIcon}>
        {playingId === item.id ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Icon name="play-circle-outline" size={28} color={COLORS.primary} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        {loading && page === 1 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Podcastler yükleniyor...</Text>
          </View>
        ) : (
          <FlatList
            data={podcasts}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Icon name="microphone-off" size={48} color={COLORS.surface} />
                <Text style={styles.emptyText}>
                  Henüz podcast bulunmuyor veya bağlantı hatası.
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => loadPodcasts(1)}>
                  <Text style={styles.retryText}>Tekrar Dene</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </PageTransition>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  listContent: { padding: SPACING.md },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, marginTop: SPACING.sm },
  podcastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  podcastIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  podcastInfo: { flex: 1, marginRight: SPACING.sm },
  podcastTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  podcastDate: {
    color: COLORS.primary,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  podcastDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  actionIcon: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: {
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  retryButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  retryText: { color: COLORS.background, fontWeight: 'bold' },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  loadMoreText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    marginRight: 8,
  },
});

export default PodcastScreen;
