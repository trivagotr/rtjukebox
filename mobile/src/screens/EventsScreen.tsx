import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {COLORS, SPACING} from '../theme/theme';
import {useAuth} from '../context/AuthContext';
import {
  AppEvent,
  MarketItem,
  claimQrReward,
  fetchEvents,
  fetchMarketItems,
  registerEvent,
} from '../services/gamificationService';

const EventsScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const isAccountRequired = !user || user.is_guest;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextEvents, nextMarket] = await Promise.all([
        user ? fetchEvents() : Promise.resolve([]),
        user ? fetchMarketItems() : Promise.resolve([]),
      ]);
      setEvents(nextEvents);
      setMarket(nextMarket);
    } catch (error) {
      console.error('Failed to load events:', error);
      Alert.alert('Hata', 'Etkinlikler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRegister = async (event: AppEvent) => {
    if (isAccountRequired) {
      Alert.alert('Hesap gerekli', 'Etkinliğe katılım ve puan için giriş yapmalısın.');
      return;
    }

    try {
      await registerEvent(event.id);
      Alert.alert('Kaydedildi', 'Etkinlik biletin profil hesabına işlendi.');
    } catch (error) {
      console.error('Failed to register event:', error);
      Alert.alert('Hata', 'Etkinliğe kayıt yapılamadı.');
    }
  };

  const handleQrClaim = async () => {
    const code = qrCode.trim();
    if (!code) {
      Alert.alert('Kod gerekli', 'QR kodunu veya görev kodunu gir.');
      return;
    }

    setClaiming(true);
    try {
      const result: any = await claimQrReward(code);
      setQrCode('');
      Alert.alert('Puan eklendi', `+${result?.points_awarded ?? 0} puan hesabına işlendi.`);
    } catch (error) {
      console.error('Failed to claim QR reward:', error);
      Alert.alert('Hata', 'Bu QR ödülü işlenemedi.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Etkinlikler</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Kampüs görevleri</Text>
          <Text style={styles.title}>Bilet, check-in ve QR görevlerinden puan kazan.</Text>
          <Text style={styles.subtitle}>Etkinliğe katıl, kapıda check-in yap, kampüsteki QR görevlerini tamamla.</Text>
        </View>

        <View style={styles.qrCard}>
          <View style={styles.qrIcon}>
            <Icon name="qrcode-scan" size={28} color={COLORS.primary} />
          </View>
          <View style={styles.qrBody}>
            <Text style={styles.cardTitle}>QR görev kodu</Text>
            <Text style={styles.cardText}>Şimdilik kamera yerine kod girişi var; sunucudaki QR kodu buraya yazılacak.</Text>
            <TextInput
              value={qrCode}
              onChangeText={setQrCode}
              editable={!isAccountRequired && !claiming}
              autoCapitalize="characters"
              placeholder="Örn: TEDU-QR-01"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.primaryButton, (isAccountRequired || claiming) && styles.disabledButton]}
              onPress={handleQrClaim}
              disabled={isAccountRequired || claiming}>
              <Text style={styles.primaryButtonText}>{isAccountRequired ? 'Hesap gerekli' : claiming ? 'İşleniyor...' : 'Puanı Al'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Yaklaşan etkinlikler</Text>
        {loading && !refreshing ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loader} />
        ) : events.length === 0 ? (
          <Empty text="Henüz aktif etkinlik yok. Admin paneli veya canlı sunucu verisiyle dolacak." />
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>{formatEventDate(event.starts_at)} · {event.location || 'Kampüs'}</Text>
              {event.description ? <Text style={styles.eventDescription} numberOfLines={3}>{event.description}</Text> : null}
              <View style={styles.eventFooter}>
                <Text style={styles.eventPoints}>+{event.check_in_points || 0} check-in puanı</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => handleRegister(event)}>
                  <Text style={styles.secondaryButtonText}>Katıl</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={styles.marketHeader}>
          <Text style={styles.sectionTitle}>Etkinlik marketi</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Market')}>
            <Text style={styles.marketLink}>Tümü</Text>
          </TouchableOpacity>
        </View>
        {market.slice(0, 4).map((item) => (
          <View key={item.id} style={styles.rewardRow}>
            <Icon name="ticket-percent-outline" size={22} color={COLORS.primary} />
            <Text style={styles.rewardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.rewardCost}>{item.cost_points} XP</Text>
          </View>
        ))}
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

function formatEventDate(value?: string | null) {
  if (!value) {
    return 'Tarih yakında';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('tr-TR', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  content: {padding: SPACING.lg, paddingBottom: SPACING.xl},
  hero: {borderRadius: 26, padding: SPACING.lg, backgroundColor: '#191512', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)'},
  kicker: {color: '#FFB020', fontSize: 12, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase'},
  title: {color: COLORS.text, fontSize: 25, fontWeight: '900', lineHeight: 31, marginTop: SPACING.sm},
  subtitle: {color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm},
  qrCard: {flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg, padding: SPACING.md, borderRadius: 22, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  qrIcon: {width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(227,30,36,0.12)'},
  qrBody: {flex: 1},
  cardTitle: {color: COLORS.text, fontSize: 16, fontWeight: '900'},
  cardText: {color: COLORS.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4},
  input: {height: 46, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: SPACING.md, marginTop: SPACING.md, backgroundColor: COLORS.background},
  primaryButton: {height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.sm},
  primaryButtonText: {color: '#fff', fontSize: 13, fontWeight: '900'},
  disabledButton: {opacity: 0.55},
  sectionTitle: {color: COLORS.text, fontSize: 19, fontWeight: '900', marginTop: SPACING.xl, marginBottom: SPACING.sm},
  loader: {paddingVertical: SPACING.lg},
  eventCard: {padding: SPACING.md, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm},
  eventTitle: {color: COLORS.text, fontSize: 17, fontWeight: '900'},
  eventMeta: {color: COLORS.textMuted, fontSize: 12, marginTop: 4},
  eventDescription: {color: COLORS.textMuted, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm},
  eventFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md},
  eventPoints: {color: '#FFB020', fontSize: 12, fontWeight: '900'},
  secondaryButton: {borderRadius: 999, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: 'rgba(227,30,36,0.16)'},
  secondaryButtonText: {color: COLORS.primary, fontSize: 13, fontWeight: '900'},
  marketHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  marketLink: {color: COLORS.primary, fontSize: 13, fontWeight: '900', marginTop: SPACING.xl, marginBottom: SPACING.sm},
  rewardRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, borderRadius: 16, backgroundColor: COLORS.surface, marginBottom: SPACING.sm},
  rewardTitle: {flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '800'},
  rewardCost: {color: COLORS.primary, fontWeight: '900'},
  empty: {padding: SPACING.lg, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  emptyText: {color: COLORS.textMuted, textAlign: 'center', lineHeight: 20},
});

export default EventsScreen;
