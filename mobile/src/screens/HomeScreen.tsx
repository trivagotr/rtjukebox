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
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';
import {COLORS, SPACING} from '../theme/theme';
import {useAuth} from '../context/AuthContext';
import {
  AppEvent,
  ArcadeGame,
  GamificationHome,
  MarketItem,
  fetchGamificationHome,
} from '../services/gamificationService';

const emptyHome: GamificationHome = {
  points: {
    lifetime_points: 0,
    spendable_points: 0,
    monthly_points: 0,
  },
  events: [],
  games: [],
  market: [],
};

const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAuth();
  const [home, setHome] = useState<GamificationHome>(emptyHome);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadHome = useCallback(async () => {
    if (!user) {
      setHome(emptyHome);
      return;
    }

    setLoading(true);
    try {
      setHome(await fetchGamificationHome());
    } catch (error) {
      console.error('Failed to fetch gamification home:', error);
      Alert.alert('Bağlantı hatası', 'Gamification bilgileri yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHome();
  };

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.kicker}>RadioTEDU XP Merkezi</Text>
            <Text style={styles.title}>
              Yayını dinle, etkinliğe katıl, puanı markete çevir.
            </Text>
            <Text style={styles.subtitle}>
              Jukebox, podcast, oyun ve kampüs etkinlikleri tek puan sistemine bağlı çalışır.
            </Text>

            <View style={styles.pointsRow}>
              <MetricCard label="Toplam" value={home.points.lifetime_points || user?.rank_score || 0} />
              <MetricCard label="Harcanabilir" value={home.points.spendable_points || 0} accent />
              <MetricCard label="Bu ay" value={home.points.monthly_points || user?.monthly_rank_score || 0} />
            </View>
          </View>

          {!user || user.is_guest ? (
            <View style={styles.lockedCard}>
              <Icon name="account-star-outline" size={26} color={COLORS.primary} />
              <View style={styles.lockedBody}>
                <Text style={styles.lockedTitle}>Puan kazanmak için hesap gerekli</Text>
                <Text style={styles.lockedText}>Misafirler gezebilir; market, etkinlik, oyun puanı ve yorumlar üyelikle açılır.</Text>
              </View>
              <TouchableOpacity style={styles.lockedButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
                <Text style={styles.lockedButtonText}>Giriş</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.quickGrid}>
            <QuickAction icon="calendar-star" label="Etkinlikler" onPress={() => navigation.navigate('Events')} />
            <QuickAction icon="gamepad-variant" label="Oyunlar" onPress={() => navigation.navigate('Games')} />
            <QuickAction icon="shopping-outline" label="Market" onPress={() => navigation.navigate('Market')} />
            <QuickAction icon="trophy-outline" label="Sıralama" onPress={() => navigation.navigate('Leaderboard')} />
          </View>

          {loading && !refreshing ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <>
              <SectionHeader title="Yaklaşan etkinlikler" action="Tümü" onPress={() => navigation.navigate('Events')} />
              {home.events.length === 0 ? (
                <EmptyCard text="Henüz aktif etkinlik yok." />
              ) : (
                home.events.slice(0, 3).map((event) => <EventPreview key={event.id} event={event} />)
              )}

              <SectionHeader title="Arcade oyunları" action="Oyna" onPress={() => navigation.navigate('Games')} />
              {home.games.length === 0 ? (
                <EmptyCard text="Oyun kataloğu sunucudan eklenecek." />
              ) : (
                home.games.slice(0, 3).map((game) => <GamePreview key={game.id} game={game} />)
              )}

              <SectionHeader title="Market vitrini" action="Market" onPress={() => navigation.navigate('Market')} />
              {home.market.length === 0 ? (
                <EmptyCard text="Market ürünleri henüz eklenmedi." />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {home.market.slice(0, 8).map((item) => <MarketPreview key={item.id} item={item} />)}
                </ScrollView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </PageTransition>
  );
};

function MetricCard({label, value, accent}: {label: string; value: number; accent?: boolean}) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({icon, label, onPress}: {icon: string; label: string; onPress: () => void}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={24} color={COLORS.primary} />
      </View>
      <Text style={styles.quickText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({title, action, onPress}: {title: string; action: string; onPress: () => void}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.sectionAction}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EventPreview({event}: {event: AppEvent}) {
  return (
    <View style={styles.previewCard}>
      <Icon name="calendar-heart" size={24} color={COLORS.primary} />
      <View style={styles.previewBody}>
        <Text style={styles.previewTitle}>{event.title}</Text>
        <Text style={styles.previewMeta}>{event.location || 'Kampüs'} · +{event.check_in_points || 0} puan</Text>
      </View>
    </View>
  );
}

function GamePreview({game}: {game: ArcadeGame}) {
  return (
    <View style={styles.previewCard}>
      <Icon name="controller-classic" size={24} color={COLORS.primary} />
      <View style={styles.previewBody}>
        <Text style={styles.previewTitle}>{game.title}</Text>
        <Text style={styles.previewMeta}>Günlük limit {game.daily_point_limit || 0} puan</Text>
      </View>
    </View>
  );
}

function MarketPreview({item}: {item: MarketItem}) {
  return (
    <View style={styles.marketMini}>
      <Icon name={item.item_kind === 'badge' ? 'shield-star' : 'shopping'} size={22} color={COLORS.primary} />
      <Text style={styles.marketTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.marketCost}>{item.cost_points} XP</Text>
    </View>
  );
}

function EmptyCard({text}: {text: string}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {padding: SPACING.lg, paddingBottom: SPACING.xl},
  hero: {
    overflow: 'hidden',
    borderRadius: 28,
    padding: SPACING.lg,
    backgroundColor: '#23090B',
    borderWidth: 1,
    borderColor: 'rgba(227,30,36,0.35)',
  },
  heroGlow: {
    position: 'absolute',
    right: -60,
    top: -70,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(227,30,36,0.45)',
  },
  kicker: {color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase'},
  title: {color: COLORS.text, fontSize: 27, fontWeight: '900', lineHeight: 33, marginTop: SPACING.sm},
  subtitle: {color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm},
  pointsRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg},
  metricCard: {
    flex: 1,
    borderRadius: 18,
    padding: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricCardAccent: {backgroundColor: 'rgba(227,30,36,0.26)', borderColor: 'rgba(227,30,36,0.5)'},
  metricValue: {color: COLORS.text, fontSize: 22, fontWeight: '900'},
  metricLabel: {color: COLORS.textMuted, fontSize: 11, marginTop: 3},
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedBody: {flex: 1},
  lockedTitle: {color: COLORS.text, fontSize: 14, fontWeight: '800'},
  lockedText: {color: COLORS.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17},
  lockedButton: {backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm},
  lockedButtonText: {color: '#fff', fontSize: 12, fontWeight: '800'},
  quickGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg},
  quickAction: {
    width: '48%',
    minHeight: 86,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(227,30,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {color: COLORS.text, fontSize: 15, fontWeight: '800', marginTop: SPACING.sm},
  loading: {paddingVertical: SPACING.xl},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.xl, marginBottom: SPACING.sm},
  sectionTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  sectionAction: {color: COLORS.primary, fontSize: 13, fontWeight: '800'},
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  previewBody: {flex: 1},
  previewTitle: {color: COLORS.text, fontSize: 15, fontWeight: '800'},
  previewMeta: {color: COLORS.textMuted, fontSize: 12, marginTop: 3},
  marketMini: {
    width: 138,
    minHeight: 126,
    marginRight: SPACING.sm,
    borderRadius: 20,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  marketTitle: {color: COLORS.text, fontSize: 13, fontWeight: '800', marginTop: SPACING.md, minHeight: 34},
  marketCost: {color: COLORS.primary, fontSize: 12, fontWeight: '900', marginTop: SPACING.sm},
  emptyCard: {padding: SPACING.lg, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  emptyText: {color: COLORS.textMuted, textAlign: 'center'},
});

export default HomeScreen;
