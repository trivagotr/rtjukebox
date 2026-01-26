import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../../theme/theme';
import io from 'socket.io-client';

import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';

const JukeboxScreen = ({ route }: any) => {
  const deviceCodeFromLink = route.params?.deviceCode;
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState<any>(null);

  useEffect(() => {
    const connectToDevice = async () => {
      if (deviceCodeFromLink) {
        try {
          // In a real app, API_URL would be in a config file
          const response = await fetch(`http://10.0.2.2:3000/jukebox/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: deviceCodeFromLink }),
          });
          const data = await response.json();
          if (data.device) {
            setDevice(data.device);
            setQueue(data.queue.queue);
          }
        } catch (error) {
          console.error('Failed to connect to device:', error);
        }
      }
    };

    connectToDevice();

    const socket = io('http://10.0.2.2:3000');

    if (device?.id) {
      socket.emit('join_device', device.id);
    }

    socket.on('queue_updated', newQueueData => {
      setQueue(newQueueData.queue);
    });

    return () => {
      socket.disconnect();
    };
  }, [deviceCodeFromLink, device?.id]);

  const renderQueueItem = ({ item, index }: { item: any; index: number }) => (
    <View style={styles.queueItem}>
      <Text style={styles.index}>{index + 1}</Text>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{item.title}</Text>
        <Text style={styles.songArtist}>{item.artist}</Text>
      </View>
      {index === 0 && (
        <View style={styles.nowPlayingBadge}>
          <Text style={styles.nowPlayingText}>ŞİMDİ</Text>
        </View>
      )}
    </View>
  );

  // ...

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />

        {device ? (
          <View style={styles.deviceBanner}>
            <Icon name="map-marker-radius" size={16} color={COLORS.primary} />
            <Text style={styles.deviceText}>{device.location || device.name}</Text>
          </View>
        ) : (
          <View style={styles.deviceBanner}>
            <Text style={styles.deviceText}>Henüz bir cihaz seçilmedi.</Text>
          </View>
        )}

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Şarkı iste..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity style={styles.searchButton}>
            <Icon name="magnify" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Müzik Kuyruğu</Text>
        <FlatList
          data={queue}
          keyExtractor={(item: any) => item.id}
          renderItem={renderQueueItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <Text style={styles.emptyText}>
              Kuyruk boş. İlk isteği sen yap!
            </Text>
          )}
        />
      </SafeAreaView>
    </PageTransition>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchContainer: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    color: '#fff',
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  listContent: { padding: SPACING.md },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  index: { color: COLORS.primary, fontSize: 18, fontWeight: 'bold', width: 30 },
  songInfo: { flex: 1 },
  songTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  songArtist: { color: COLORS.textMuted, fontSize: 14 },
  nowPlayingBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  nowPlayingText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 50 },
});

export default JukeboxScreen;
