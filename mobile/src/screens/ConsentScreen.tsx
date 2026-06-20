import React, {useState} from 'react';
import {
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
import {COLORS, SPACING} from '../theme/theme';
import {AgeRange, Gender, useConsent} from '../privacy/ConsentContext';
import {setAnalyticsConsent} from '../services/analyticsService';

const AGE_RANGES: AgeRange[] = [
  'under18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55plus',
];
const GENDERS: Gender[] = ['female', 'male', 'other', 'na'];
const GENDER_LABEL_KEY: Record<Gender, string> = {
  female: 'privacy.genderFemale',
  male: 'privacy.genderMale',
  other: 'privacy.genderOther',
  na: 'privacy.genderNA',
};
const POLICY_URL = 'https://radiotedu.com/privacy';

function ageLabel(t: (k: string) => string, r: AgeRange): string {
  if (r === 'under18') {
    return t('privacy.ageUnder18');
  }
  if (r === '55plus') {
    return t('privacy.age55plus');
  }
  return r;
}

/** First-launch consent gate. Renders until the user makes a choice. */
const ConsentScreen = () => {
  const {t} = useTranslation();
  const {saveConsent} = useConsent();

  const [analytics, setAnalytics] = useState(true);
  const [demographics, setDemographics] = useState(false);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);

  const accept = async () => {
    await saveConsent({
      analytics,
      demographics,
      ageRange: demographics ? ageRange : null,
      gender: demographics ? gender : null,
    });
    setAnalyticsConsent(analytics, {
      ageRange: demographics ? ageRange : null,
      gender: demographics ? gender : null,
    });
  };

  const declineAll = async () => {
    await saveConsent({
      analytics: false,
      demographics: false,
      ageRange: null,
      gender: null,
    });
    setAnalyticsConsent(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('privacy.consentTitle')}</Text>
        <Text style={styles.intro}>{t('privacy.intro')}</Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.analyticsLabel')}</Text>
            <Text style={styles.rowDesc}>{t('privacy.analyticsDesc')}</Text>
          </View>
          <Switch
            value={analytics}
            onValueChange={setAnalytics}
            trackColor={{true: COLORS.primary, false: '#555'}}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.demographicsLabel')}</Text>
            <Text style={styles.rowDesc}>{t('privacy.demographicsDesc')}</Text>
          </View>
          <Switch
            value={demographics}
            onValueChange={setDemographics}
            trackColor={{true: COLORS.primary, false: '#555'}}
          />
        </View>

        {demographics && (
          <View style={styles.demo}>
            <Text style={styles.groupLabel}>{t('privacy.ageRange')}</Text>
            <View style={styles.chips}>
              {AGE_RANGES.map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setAgeRange(r)}
                  style={[styles.chip, ageRange === r && styles.chipOn]}>
                  <Text
                    style={[
                      styles.chipText,
                      ageRange === r && styles.chipTextOn,
                    ]}>
                    {ageLabel(t, r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.groupLabel}>{t('privacy.gender')}</Text>
            <View style={styles.chips}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  style={[styles.chip, gender === g && styles.chipOn]}>
                  <Text
                    style={[styles.chipText, gender === g && styles.chipTextOn]}>
                    {t(GENDER_LABEL_KEY[g])}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity onPress={() => Linking.openURL(POLICY_URL)}>
          <Text style={styles.policyLink}>{t('privacy.viewPolicy')}</Text>
        </TouchableOpacity>
        <Text style={styles.terms}>{t('privacy.termsNote')}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={declineAll}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.declineAll')}>
          <Text style={styles.declineText}>{t('privacy.declineAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={accept}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.acceptSelected')}>
          <Text style={styles.acceptText}>{t('privacy.acceptSelected')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {padding: SPACING.lg},
  title: {color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: SPACING.sm},
  intro: {color: COLORS.textMuted, fontSize: 14, lineHeight: 20, marginBottom: SPACING.lg},
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
  demo: {marginTop: SPACING.sm, marginBottom: SPACING.md},
  groupLabel: {color: COLORS.text, fontSize: 14, fontWeight: '700', marginTop: SPACING.md, marginBottom: SPACING.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm},
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: {backgroundColor: COLORS.primary, borderColor: COLORS.primary},
  chipText: {color: COLORS.text, fontSize: 13},
  chipTextOn: {color: '#fff', fontWeight: '700'},
  policyLink: {color: COLORS.primary, fontSize: 14, fontWeight: '600', marginTop: SPACING.md},
  terms: {color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.sm},
  actions: {flexDirection: 'row', gap: SPACING.md, padding: SPACING.lg},
  declineBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  declineText: {color: COLORS.text, fontWeight: '700'},
  acceptBtn: {
    flex: 1.4,
    paddingVertical: SPACING.md,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  acceptText: {color: '#fff', fontWeight: '800'},
});

export default ConsentScreen;
