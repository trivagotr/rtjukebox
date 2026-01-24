import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../../theme/theme';
import io from 'socket.io-client';

import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';

const JukeboxScreen = () => {
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Connect to backend socket
    const socket = io('http://10.0.2.2:3000');

    socket.on('queueUpdate', newQueue => {
      setQueue(newQueue);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const renderQueueItem = ({item, index}: {item: any; index: number}) => (
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
  container: {flex: 1, backgroundColor: COLORS.background},
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
  listContent: {padding: SPACING.md},
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
  index: {color: COLORS.primary, fontSize: 18, fontWeight: 'bold', width: 30},
  songInfo: {flex: 1},
  songTitle: {color: COLORS.text, fontSize: 16, fontWeight: 'bold'},
  songArtist: {color: COLORS.textMuted, fontSize: 14},
  nowPlayingBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  nowPlayingText: {color: '#fff', fontSize: 10, fontWeight: 'bold'},
  emptyText: {color: COLORS.textMuted, textAlign: 'center', marginTop: 50},
});

export default JukeboxScreen;
