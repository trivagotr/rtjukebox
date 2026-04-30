import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {COLORS, SPACING} from '../theme/theme';
import {useAuth} from '../context/AuthContext';
import {
  ArcadeGame,
  MarketItem,
  fetchGames,
  fetchMarketItems,
  submitGameScore,
} from '../services/gamificationService';

const GamesScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAuth();
  const [games, setGames] = useState<ArcadeGame[]>([]);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingGameId, setSubmittingGameId] = useState<string | null>(null);
  const isAccountRequired = !user || user.is_guest;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextGames, nextMarket] = await Promise.all([
        user ? fetchGames() : Promise.resolve([]),
        user ? fetchMarketItems() : Promise.resolve([]),
      ]);
      setGames(nextGames);
      setMarket(nextMarket);
    } catch (error) {
      console.error('Failed to load games:', error);
      Alert.alert('Hata', 'Oyunlar yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const playQuickRound = async (game: ArcadeGame) => {
    if (isAccountRequired) {
      Alert.alert('Hesap gerekli', 'Oyun puanı kazanmak için giriş yapmalısın.');
      return;
    }

    const score = Math.floor(120 + Math.random() * 880);
    setSubmittingGameId(game.id);
    try {
      const result: any = await submitGameScore(game.id, score);
      Alert.alert('Skor gönderildi', `${score} skor · +${result?.points_awarded ?? 0} puan`);
    } catch (error) {
      console.error('Failed to submit game score:', error);
      Alert.alert('Hata', 'Skor gönderilemedi.');
    } finally {
      setSubmittingGameId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Oyunlar</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Icon name="gamepad-variant" size={34} color="#111" />
          <Text style={styles.title}>Arcade puanı günlük limitli çalışır.</Text>
          <Text style={styles.subtitle}>Oyunlar admin tarafından sunucudan açılır. Eşit puan durumunda sıralama rastgele değil, puan geçmişine göre ayrılır.</Text>
        </View>

        {isAccountRequired ? (
          <View style={styles.accountCard}>
            <Icon name="lock-outline" size={24} color={COLORS.primary} />
            <Text style={styles.accountText}>Misafirler oyunları görebilir; skor ve ödül için hesap gerekir.</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Aktif oyunlar</Text>
        {loading && !refreshing ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loader} />
        ) : games.length === 0 ? (
          <Empty text="Sunucuda aktif oyun yok. İlk arcade oyunları admin katalog kaydıyla görünecek." />
        ) : (
          games.map((game) => (
            <View key={game.id} style={styles.gameCard}>
              <View style={styles.gameIcon}>
                <Icon name="controller-classic" size={28} color={COLORS.primary} />
              </View>
              <View style={styles.gameBody}>
                <Text style={styles.gameTitle}>{game.title}</Text>
                {game.description ? <Text style={styles.gameDescription} numberOfLines={2}>{game.description}</Text> : null}
                <View style={styles.gameMetaRow}>
                  <Text style={styles.gameMeta}>Günlük limit {game.daily_point_limit || 0} XP</Text>
                  <Text style={styles.gameMeta}>Oran {Number(game.point_rate || 0)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.playButton, submittingGameId === game.id && styles.disabledButton]}
                  disabled={submittingGameId === game.id}
                  onPress={() => playQuickRound(game)}>
                  <Text style={styles.playButtonText}>
                    {submittingGameId === game.id ? 'Gönderiliyor...' : 'Hızlı Tur Oyna'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={styles.marketHeader}>
          <Text style={styles.sectionTitle}>Oyun marketi</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Market')}>
            <Text style={styles.marketLink}>Tümü</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {market.slice(0, 8).map((item) => (
            <View key={item.id} style={styles.marketCard}>
              <Text style={styles.marketTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.marketCost}>{item.cost_points} XP</Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
};

function Empty({text}: {text: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  content: {padding: SPACING.lg, paddingBottom: SPACING.xl},
  hero: {borderRadius: 28, padding: SPACING.lg, backgroundColor: '#F4C542'},
  title: {color: '#111', fontSize: 26, fontWeight: '900', lineHeight: 32, marginTop: SPACING.md},
  subtitle: {color: 'rgba(0,0,0,0.68)', fontSize: 14, lineHeight: 21, marginTop: SPACING.sm, fontWeight: '600'},
  accountCard: {flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', padding: SPACING.md, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg},
  accountText: {flex: 1, color: COLORS.textMuted, fontSize: 13, lineHeight: 18},
  sectionTitle: {color: COLORS.text, fontSize: 19, fontWeight: '900', marginTop: SPACING.xl, marginBottom: SPACING.sm},
  loader: {paddingVertical: SPACING.lg},
  gameCard: {flexDirection: 'row', gap: SPACING.md, padding: SPACING.md, borderRadius: 22, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm},
  gameIcon: {width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(227,30,36,0.12)'},
  gameBody: {flex: 1},
  gameTitle: {color: COLORS.text, fontSize: 17, fontWeight: '900'},
  gameDescription: {color: COLORS.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4},
  gameMetaRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm},
  gameMeta: {color: COLORS.textMuted, fontSize: 11, fontWeight: '700'},
  playButton: {height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.md},
  playButtonText: {color: '#fff', fontSize: 13, fontWeight: '900'},
  disabledButton: {opacity: 0.6},
  marketHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  marketLink: {color: COLORS.primary, fontSize: 13, fontWeight: '900', marginTop: SPACING.xl, marginBottom: SPACING.sm},
  marketCard: {width: 130, minHeight: 96, padding: SPACING.md, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.sm},
  marketTitle: {color: COLORS.text, fontSize: 13, fontWeight: '800', minHeight: 38},
  marketCost: {color: COLORS.primary, fontWeight: '900', marginTop: SPACING.sm},
  empty: {padding: SPACING.lg, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  emptyText: {color: COLORS.textMuted, textAlign: 'center', lineHeight: 20},
});

export default GamesScreen;
