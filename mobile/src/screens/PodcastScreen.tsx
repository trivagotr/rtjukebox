import React, {useState, useEffect} from 'react';
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
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../theme/theme';
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

  useEffect(() => {
    loadPodcasts();
  }, []);

  const loadPodcasts = async () => {
    setLoading(true);
    try {
      const data = await fetchPodcasts();
      setPodcasts(data);
    } catch (e) {
      console.log('Failed to fetch podcasts', e);
      Alert.alert('Hata', 'Podcast listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPodcasts();
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
        // Here you would integrate TrackPlayer or just open the audio URL
        // For now ensuring we support opening the direct link like we do with Spotify
        // If it's a direct audio file, Linking.openURL(audioUrl) might open it in browser player
        // Better UX would be in-app player, but sticking to previous requirement of "Link opening" consistency
        // unless specified otherwise. However, user asked to "fetch from spotify rss",
        // typically we want to PLAY it.
        // Let's open the link (Spotify/Web) or Audio URL.
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
            prev.map(p => (p.id === podcast.id ? {...p, spotifyUrl: url} : p)),
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

  const renderItem = ({item}: {item: Podcast}) => (
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
        {loading && !refreshing ? (
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
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Icon name="microphone-off" size={48} color={COLORS.surface} />
                <Text style={styles.emptyText}>
                  Henüz podcast bulunmuyor veya bağlantı hatası.
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={loadPodcasts}>
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
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerTitle: {color: COLORS.text, fontSize: 24, fontWeight: 'bold'},
  listContent: {padding: SPACING.md},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  loadingText: {color: COLORS.textMuted, marginTop: SPACING.sm},
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
  podcastInfo: {flex: 1, marginRight: SPACING.sm},
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
  emptyContainer: {alignItems: 'center', marginTop: 100},
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
  retryText: {color: COLORS.background, fontWeight: 'bold'},
});

export default PodcastScreen;
