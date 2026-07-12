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
import {useTranslation} from 'react-i18next';
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
  const {t} = useTranslation();
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
          Alert.alert(t('home.connectionErrorTitle'), t('home.connectionError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, user]);

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
              <Text style={styles.title}>
                {t('home.heroTitle')}
              </Text>
              <Text style={styles.subtitle}>
                {t('home.heroSubtitle')}
              </Text>

              <View style={styles.pointsRow}>
              <MetricCard label={t('home.points.total')} value={home.points.lifetime_points || user?.rank_score || 0} />
              <MetricCard label={t('home.points.spendable')} value={home.points.spendable_points || 0} accent />
              <MetricCard label={t('home.points.monthly')} value={home.points.monthly_points || user?.monthly_rank_score || 0} />
            </View>
          </View>

          {!user || user.is_guest ? (
            <View style={styles.lockedCard}>
              <Icon name="account-star-outline" size={26} color={COLORS.primary} />
              <View style={styles.lockedBody}>
                  <Text style={styles.lockedTitle}>{t('home.accountRequiredTitle')}</Text>
                  <Text style={styles.lockedText}>{t('home.accountRequiredBody')}</Text>
              </View>
              <TouchableOpacity style={styles.lockedButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
                    <Text style={styles.lockedButtonText}>{t('home.login')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.quickGrid}>
            <QuickAction icon="timer-outline" label={t('focus.title')} onPress={() => navigation.navigate('Focus')} />
              <QuickAction icon="vote-outline" label={t('home.vote')} onPress={() => navigation.navigate('NextSongVote')} />
              <QuickAction icon="account-group-outline" label={t('home.social')} onPress={() => navigation.navigate('Social')} />
              <QuickAction icon="trophy-outline" label={t('tabs.leaderboard')} onPress={() => navigation.navigate('Leaderboard')} />
              <QuickAction icon="calendar-star" label={t('home.events')} onPress={() => navigation.navigate('Events')} />
              <QuickAction icon="gamepad-variant" label={t('home.games')} onPress={() => navigation.navigate('Games')} />
              <QuickAction icon="shopping-outline" label={t('home.market')} onPress={() => navigation.navigate('Market')} />
          </View>

          {loading && !refreshing ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <>
                <SectionHeader title={t('home.upcomingEvents')} action={t('home.all')} onPress={() => navigation.navigate('Events')} />
                {home.events.length === 0 ? (
                  <EmptyCard text={t('home.noEvents')} />
              ) : (
                home.events.slice(0, 3).map((event) => <EventPreview key={event.id} event={event} />)
              )}

                <SectionHeader title={t('home.arcadeGames')} action={t('common.play')} onPress={() => navigation.navigate('Games')} />
                {home.games.length === 0 ? (
                  <EmptyCard text={t('home.noGames')} />
              ) : (
                home.games.slice(0, 3).map((game) => <GamePreview key={game.id} game={game} />)
              )}

                <SectionHeader title={t('home.marketShowcase')} action={t('home.market')} onPress={() => navigation.navigate('Market')} />
                {home.market.length === 0 ? (
                  <EmptyCard text={t('home.noMarketItems')} />
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
      <Text
        style={styles.metricLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        allowFontScaling={false}>
        {label}
      </Text>
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
  const {t} = useTranslation();
  return (
    <View style={styles.previewCard}>
      <Icon name="calendar-heart" size={24} color={COLORS.primary} />
      <View style={styles.previewBody}>
        <Text style={styles.previewTitle}>{event.title}</Text>
          <Text style={styles.previewMeta}>{t('home.eventMeta', {location: event.location || t('home.campus'), points: event.check_in_points || 0})}</Text>
      </View>
    </View>
  );
}

function GamePreview({game}: {game: ArcadeGame}) {
  const {t} = useTranslation();
  return (
    <View style={styles.previewCard}>
      <Icon name="controller-classic" size={24} color={COLORS.primary} />
      <View style={styles.previewBody}>
        <Text style={styles.previewTitle}>{game.title}</Text>
          <Text style={styles.previewMeta}>{t('home.gameMeta', {points: game.daily_point_limit || 0})}</Text>
      </View>
    </View>
  );
}

function MarketPreview({item}: {item: MarketItem}) {
  const {t} = useTranslation();
  return (
    <View style={styles.marketMini}>
      <Icon name={item.item_kind === 'badge' ? 'shield-star' : 'shopping'} size={22} color={COLORS.primary} />
      <Text style={styles.marketTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.marketCost}>{t('home.marketCost', {points: item.cost_points})}</Text>
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
  title: {color: COLORS.text, fontSize: 27, fontWeight: '900', lineHeight: 33},
  subtitle: {color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm},
  pointsRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg},
  metricCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricCardAccent: {backgroundColor: 'rgba(227,30,36,0.26)', borderColor: 'rgba(227,30,36,0.5)'},
  metricValue: {color: COLORS.text, fontSize: 22, fontWeight: '900'},
  metricLabel: {color: COLORS.textMuted, fontSize: 10, fontWeight: '700', marginTop: 3, textAlign: 'center'},
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
