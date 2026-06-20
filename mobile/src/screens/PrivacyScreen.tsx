import React from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../theme/theme';
import {useConsent} from '../privacy/ConsentContext';
import {setAnalyticsConsent} from '../services/analyticsService';

const POLICY_URL = 'https://radiotedu.com/privacy';
// Google Play requires a way to request account/data deletion.
const DELETE_ACCOUNT_URL = 'https://radiotedu.com/delete-account';

const PrivacyScreen = ({navigation}: any) => {
  const {t} = useTranslation();
  const {consent, saveConsent, withdrawAll} = useConsent();

  const update = async (next: {analytics?: boolean; demographics?: boolean}) => {
    const merged = {...consent, ...next};
    await saveConsent(next);
    setAnalyticsConsent(merged.analytics, {
      ageRange: merged.demographics ? consent.ageRange : null,
      gender: merged.demographics ? consent.gender : null,
    });
  };

  const onWithdraw = async () => {
    await withdrawAll();
    setAnalyticsConsent(false);
    Alert.alert(t('privacy.title'), t('privacy.withdrawn'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Icon name="arrow-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('privacy.title')}</Text>
        <View style={{width: 26}} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('privacy.intro')}</Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.analyticsLabel')}</Text>
            <Text style={styles.rowDesc}>{t('privacy.analyticsDesc')}</Text>
          </View>
          <Switch
            value={consent.analytics}
            onValueChange={v => update({analytics: v})}
            trackColor={{true: COLORS.primary, false: '#555'}}
            accessibilityLabel={t('privacy.analyticsLabel')}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.demographicsLabel')}</Text>
            <Text style={styles.rowDesc}>{t('privacy.demographicsDesc')}</Text>
          </View>
          <Switch
            value={consent.demographics}
            onValueChange={v => update({demographics: v})}
            trackColor={{true: COLORS.primary, false: '#555'}}
            accessibilityLabel={t('privacy.demographicsLabel')}
          />
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel={t('privacy.viewPolicy')}>
          <Text style={styles.policyLink}>{t('privacy.viewPolicy')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => Linking.openURL(DELETE_ACCOUNT_URL)}
          accessibilityRole="link"
          accessibilityLabel={t('privacy.deleteAccount')}>
          <Text style={styles.policyLink}>{t('privacy.deleteAccount')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={onWithdraw}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.withdraw')}>
          <Icon name="delete-outline" size={20} color={COLORS.error} />
          <Text style={styles.withdrawText}>{t('privacy.withdraw')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {color: COLORS.text, fontSize: 18, fontWeight: 'bold'},
  content: {padding: SPACING.md},
  intro: {color: COLORS.textMuted, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowText: {flex: 1, paddingRight: SPACING.md},
  rowLabel: {color: COLORS.text, fontSize: 15, fontWeight: '700'},
  rowDesc: {color: COLORS.textMuted, fontSize: 12, marginTop: 2},
  policyLink: {color: COLORS.primary, fontSize: 14, fontWeight: '600', marginTop: SPACING.md},
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  withdrawText: {color: COLORS.error, fontWeight: '700'},
});

export default PrivacyScreen;
