import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../../theme/theme';
import io from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';

const { width } = Dimensions.get('window');

const JukeboxScreen = ({ route }: any) => {
  const { user, guestLogin } = useAuth();
  const navigation = useNavigation<any>();
  const deviceCodeFromLink = route.params?.deviceCode;

  const [queue, setQueue] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [device, setDevice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Multi-device states
  const [deviceList, setDeviceList] = useState<any[]>([]);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  // Guest Logic States
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [pendingSong, setPendingSong] = useState<any>(null);


  // Fetch available devices on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await api.get('/jukebox/devices');
        setDeviceList(response.data.data.devices || []);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      }
    };
    fetchDevices();
  }, []);

  // Connect to device when code is available
  useEffect(() => {
    const connectToDevice = async (code: string) => {
      try {
        setIsLoading(true);
        const response = await api.post('/jukebox/connect', { device_code: code });
        const { device: deviceData, queue: queueData } = response.data.data;
        setDevice(deviceData);
        setQueue(queueData.queue || []);
        setNowPlaying(queueData.now_playing);
        // Save last connected device
        await AsyncStorage.setItem('last_jukebox_code', code);
      } catch (error) {
        console.error('Failed to connect to device:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const initConnection = async () => {
      if (deviceCodeFromLink) {
        connectToDevice(deviceCodeFromLink);
      } else {
        // Try to use last connected device
        const lastCode = await AsyncStorage.getItem('last_jukebox_code');
        if (lastCode) {
          connectToDevice(lastCode);
        } else if (deviceList.length > 0) {
          // Auto-select first device
          connectToDevice(deviceList[0].device_code);
        } else {
          setShowDeviceSelector(true);
        }
      }
    };

    initConnection();
  }, [deviceCodeFromLink, deviceList]);

  useEffect(() => {
    if (!device) return;

    const socket = io(api.defaults.baseURL?.split('/api/v1')[0] || '');


    // JOIN THE DEVICE ROOM
    if (device) {
      socket.emit('join_device', device.id);
    }

    socket.on('queue_updated', newQueueData => {
      setQueue(newQueueData.queue || []);
      setNowPlaying(newQueueData.now_playing);
    });

    socket.on('song_skipped', () => {
      Alert.alert('Şarkı Geçildi', 'Topluluk oylaması sonucu şarkı geçildi.');
    });

    return () => {
      socket.disconnect();
    };
  }, [deviceCodeFromLink, device]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (search) {
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const performSearch = async () => {
    try {
      setIsSearching(true);
      const response = await api.get(`/jukebox/songs?search=${search}`);
      setSearchResults(response.data.data.items);
    } catch (error: any) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRequestSong = async (song: any) => {
    if (!device) {
      Alert.alert('Hata', 'Lütfen önce bir müzik kutusuna bağlanın.');
      return;
    }

    if (user) {
      return addSongToQueue(song.id);
    }

    const guestUsed = await AsyncStorage.getItem('guest_request_used');
    if (guestUsed === 'true') {
      Alert.alert(
        'Limit Aşıldı',
        'Misafir olarak ücretsiz şarkı hakkınızı kullandınız. Daha fazla şarkı eklemek için lütfen giriş yapın.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Giriş Yap', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) }
        ]
      );
    } else {
      setPendingSong(song);
      setShowGuestModal(true);
    }
  };

  const handleGuestSubmit = async () => {
    if (!guestName.trim()) {
      Alert.alert('Hata', 'Lütfen bir isim girin.');
      return;
    }

    try {
      setIsLoading(true);
      await guestLogin(guestName);
      await AsyncStorage.setItem('guest_request_used', 'true');
      setShowGuestModal(false);
      setGuestName('');

      if (pendingSong) {
        await addSongToQueue(pendingSong.id);
        setPendingSong(null);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addSongToQueue = async (songId: string) => {
    try {
      setIsLoading(true);
      await api.post('/jukebox/queue', {
        device_id: device.id,
        song_id: songId
      });
      Alert.alert('Başarılı', 'Şarkı kuyruğa eklendi.');
      setSearch('');
      setSearchResults([]);
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.error || 'Şarkı eklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (item: any, voteType: number) => {
    if (!device) return;
    try {
      await api.post('/jukebox/vote', {
        queue_item_id: item.id.startsWith('autoplay') ? null : item.id,
        song_id: item.song_id,
        vote: voteType,
        device_id: device.id
      });
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.error || 'Oy verilemedi.');
    }
  };

  const renderQueueItem = ({ item, index }: { item: any; index: number }) => {
    const storageApi = 'http://192.168.0.13:3000';

    let coverUrl = item.cover_url;
    if (coverUrl && coverUrl.startsWith('/')) {
      coverUrl = storageApi + coverUrl;
    } else if (!coverUrl) {
      coverUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=random&color=fff`;
    }

    return (
      <View style={styles.queueItem}>
        <Text style={styles.index}>{index + 1}</Text>
        <Image source={{ uri: coverUrl }} style={styles.queueArt} />

        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
          <Text style={styles.addedBy}>
            {item.added_by_name || 'Radio TEDU'} tarafından
          </Text>
        </View>

        <View style={styles.voteControls}>
          <TouchableOpacity onPress={() => handleVote(item, 1)} style={styles.miniVoteButton}>
            <Icon name="arrow-up-bold" size={20} color={item.user_vote === 1 ? COLORS.primary : COLORS.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.miniVoteText, item.user_vote !== 0 && { color: item.user_vote === 1 ? COLORS.primary : COLORS.error }]}>
            {(item.upvotes || 0) - (item.downvotes || 0)}
          </Text>
          <TouchableOpacity onPress={() => handleVote(item, -1)} style={styles.miniVoteButton}>
            <Icon name="arrow-down-bold" size={20} color={item.user_vote === -1 ? COLORS.error : COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.searchResultItem} onPress={() => handleRequestSong(item)}>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{item.title}</Text>
        <Text style={styles.songArtist}>{item.artist}</Text>
      </View>
      <Icon name="plus-circle" size={24} color={COLORS.primary} />
    </TouchableOpacity>
  );

  const NowPlayingHero = ({ song }: { song: any }) => {
    if (!song) return (
      <View style={styles.heroContainer}>
        <View style={styles.idleDisc}>
          <Icon name="music-note" size={40} color={COLORS.textMuted} />
        </View>
        <Text style={styles.idleText}>Şarkı bekleniyor...</Text>
      </View>
    );

    const storageApi = 'http://192.168.0.13:3000';
    let coverUrl = song.cover_url;
    if (coverUrl && coverUrl.startsWith('/')) coverUrl = storageApi + coverUrl;
    else if (!coverUrl) coverUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=random&color=fff`;

    return (
      <View style={styles.heroContainer}>
        <View style={styles.heroContent}>
          <Image source={{ uri: coverUrl }} style={styles.heroArt} />
          <View style={styles.heroInfo}>
            <View style={styles.playingTag}>
              <View style={styles.pulsingDot} />
              <Text style={styles.playingTagText}>ŞU AN ÇALIYOR</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{song.title}</Text>
            <Text style={styles.heroArtist} numberOfLines={1}>{song.artist}</Text>
            <Text style={styles.heroRequester}>
              <Icon name="account" size={12} /> {song.added_by_name || 'Otomatik'}
            </Text>
          </View>
        </View>

        <View style={styles.voteBar}>
          <TouchableOpacity style={styles.voteBtn} onPress={() => handleVote(song, 1)}>
            <Icon name="thumb-up" size={24} color="#4ADE80" />
            <Text style={[styles.voteBtnText, { color: '#4ADE80' }]}>Beğen</Text>
          </TouchableOpacity>

          <View style={styles.voteDivider} />

          <TouchableOpacity style={styles.voteBtn} onPress={() => handleVote(song, -1)}>
            <Icon name="thumb-down" size={24} color="#F87171" />
            <Text style={[styles.voteBtnText, { color: '#F87171' }]}>Beğenme</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />

        <Modal
          visible={showGuestModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowGuestModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Ücretsiz Şarkı Hakkı!</Text>
              <Text style={styles.modalText}>
                RadyoTEDU'da ilk şarkınızı misafir olarak ücretsiz isteyebilirsiniz. Lütfen isminizi girin:
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="İsminiz"
                placeholderTextColor={COLORS.textMuted}
                value={guestName}
                onChangeText={setGuestName}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: 'transparent' }]}
                  onPress={() => setShowGuestModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: COLORS.textMuted }]}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleGuestSubmit}
                >
                  <Text style={styles.modalButtonText}>Devam Et</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showDeviceSelector}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDeviceSelector(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDeviceSelector(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Müzik Kutusu Seçin</Text>
                <TouchableOpacity
                  onPress={() => setShowDeviceSelector(false)}
                  style={styles.closeButton}
                >
                  <Icon name="close" size={24} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {deviceList.length === 0 ? (
                <View style={styles.emptyDeviceContainer}>
                  <Icon name="poker-chip" size={48} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
                  <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>
                    Aktif bir müzik kutusu bulunamadı.
                  </Text>
                </View>
              ) : (
                deviceList.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.deviceOption,
                      device?.id === d.id && { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: 'rgba(227, 30, 36, 0.05)' }
                    ]}
                    onPress={async () => {
                      try {
                        setIsLoading(true);
                        const response = await api.post('/jukebox/connect', { device_code: d.device_code });
                        const { device: deviceData, queue: queueData } = response.data.data;
                        setDevice(deviceData);
                        setQueue(queueData.queue || []);
                        setNowPlaying(queueData.now_playing);
                        await AsyncStorage.setItem('last_jukebox_code', d.device_code);
                        setShowDeviceSelector(false);
                      } catch (error) {
                        Alert.alert('Hata', 'Cihaza bağlanılamadı');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    <Icon name="radio" size={24} color={device?.id === d.id ? COLORS.primary : COLORS.textMuted} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{d.name}</Text>
                      {d.location && (
                        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{d.location}</Text>
                      )}
                    </View>
                    {device?.id === d.id && (
                      <Icon name="check-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}

              <TouchableOpacity
                style={[styles.modalButton, { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.05)' }]}
                onPress={() => setShowDeviceSelector(false)}
              >
                <Text style={[styles.modalButtonText, { color: COLORS.text }]}>Vazgeç</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Tappable Device Banner */}
        <TouchableOpacity style={styles.deviceBanner} onPress={() => setShowDeviceSelector(true)}>
          <Icon name="map-marker-radius" size={16} color={COLORS.primary} />
          <Text style={styles.deviceText}>
            {device ? (device.location || device.name) : 'Cihaz Seçin'}
          </Text>
          <Icon name="chevron-down" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.searchContainer}>
          <View style={styles.searchWrapper}>
            <Icon name="magnify" size={20} color={COLORS.textMuted} style={{ marginLeft: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Şarkı ara..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {isSearching && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 10 }} />}
          </View>
        </View>

        {searchResults.length > 0 ? (
          <View style={{ flex: 1, paddingHorizontal: SPACING.md }}>
            <Text style={styles.sectionTitle}>Sonuçlar</Text>
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={renderSearchResult}
            />
          </View>
        ) : (
          <FlatList
            data={queue}
            ListHeaderComponent={
              <>
                <NowPlayingHero song={nowPlaying} />
                <View style={styles.queueHeader}>
                  <Text style={styles.sectionTitle}>Müzik Kuyruğu</Text>
                  <View style={styles.queueCountBadge}>
                    <Text style={styles.queueCountText}>{queue.length}</Text>
                  </View>
                </View>
              </>
            }
            keyExtractor={(item: any) => item.id}
            renderItem={renderQueueItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>Kuyruk boş. İlk isteği sen yap!</Text>
            )}
          />
        )}

      </SafeAreaView>
    </PageTransition>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchContainer: { padding: SPACING.md },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 50,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    paddingHorizontal: SPACING.sm,
  },

  // Hero Styles
  heroContainer: {
    backgroundColor: COLORS.surface,
    margin: SPACING.md,
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 0,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroArt: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#333',
  },
  heroInfo: {
    flex: 1,
    marginLeft: SPACING.md,
    justifyContent: 'center',
  },
  playingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(227, 30, 36, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },
  playingTagText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginBottom: 6,
  },
  heroRequester: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  voteBar: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 4,
  },
  voteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  voteBtnText: {
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 14,
  },
  voteDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
  },

  // List Styles
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: SPACING.md,
    marginBottom: SPACING.sm,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  queueCountBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    marginBottom: SPACING.sm, // align with input
  },
  queueCountText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: { paddingBottom: 100 },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  queueArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  index: {
    color: COLORS.textMuted,
    width: 24,
    fontSize: 14,
    fontWeight: 'bold',
  },
  songInfo: { flex: 1, marginLeft: SPACING.md },
  songTitle: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  songArtist: { color: COLORS.textMuted, fontSize: 13 },
  addedBy: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  voteControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniVoteButton: {
    padding: 4,
  },
  miniVoteText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    minWidth: 16,
    textAlign: 'center',
  },

  // Misc
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 50 },
  deviceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: SPACING.sm,
    marginHorizontal: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  deviceText: { color: COLORS.text, fontSize: 13, marginLeft: 6 },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: 4,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderRadius: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: SPACING.lg,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  emptyDeviceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  modalText: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: SPACING.md,
    color: '#fff',
    fontSize: 18,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    height: 50,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  idleDisc: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  idleText: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  deviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});

export default JukeboxScreen;
