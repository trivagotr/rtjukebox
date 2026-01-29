import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';
import api from '../services/api';

const LeaderboardScreen = () => {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await api.get('/users/leaderboard');
      setLeaderboard(response.data.data.leaderboard || []);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: any;
    index: number;
  }) => {
    let rankColor = COLORS.text;
    let rankIcon = null;

    if (index === 0) {
      rankColor = '#FFD700'; // Gold
      rankIcon = 'crown';
    } else if (index === 1) {
      rankColor = '#C0C0C0'; // Silver
      rankIcon = 'medal';
    } else if (index === 2) {
      rankColor = '#CD7F32'; // Bronze
      rankIcon = 'medal-outline';
    }

    return (
      <View style={styles.itemContainer}>
        <View style={styles.rankContainer}>
          {rankIcon ? (
            <Icon name={rankIcon} size={24} color={rankColor} />
          ) : (
            <Text style={styles.rankText}>{index + 1}</Text>
          )}
        </View>

        <Image
          source={{ uri: item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.display_name)}&background=random&color=fff` }}
          style={styles.avatar}
        />

        <View style={styles.infoContainer}>
          <Text style={styles.name}>{item.display_name}</Text>
          <Text style={styles.songsAdded}>{item.total_songs_added} Şarkı</Text>
        </View>

        <View style={styles.pointsContainer}>
          <Text style={styles.points}>{item.rank_score}</Text>
          <Text style={styles.pointsLabel}>Puan</Text>
        </View>
      </View>
    );
  };

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sıralama</Text>
          <Text style={styles.headerSubtitle}>En Aktif Dinleyiciler</Text>
        </View>

        {loading && !refreshing ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={leaderboard}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
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
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  headerSubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  listContent: { padding: SPACING.md },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rankText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textMuted },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: SPACING.md },
  infoContainer: { flex: 1 },
  name: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  songsAdded: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  pointsContainer: { alignItems: 'flex-end' },
  points: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  pointsLabel: { fontSize: 10, color: COLORS.textMuted },
});

export default LeaderboardScreen;
