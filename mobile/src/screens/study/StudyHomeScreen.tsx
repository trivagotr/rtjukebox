import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';
import {useAuth} from '../../context/AuthContext';
import {COLORS, SPACING} from '../../theme/theme';
import type {StudyLocationId} from '../../services/studyService';

export const STUDY_LOCATION_CARDS: Array<{
  id: StudyLocationId;
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {id: 'library', title: 'Library', subtitle: 'Quiet desk rows, focus timer, and classic Study seating.', icon: 'bookshelf'},
  {id: 'chim-alan', title: 'Çim alan', subtitle: 'Amphitheatre steps, stair paths, Spark, Rock, and open-air focus.', icon: 'stairs'},
];

const StudyHomeScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAuth();
  const locked = !user || user.is_guest;

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Study</Text>
            <Text style={styles.title}>Choose your focus place</Text>
            <Text style={styles.subtitle}>Your app login carries into Study automatically. Points and clothes stay server-owned.</Text>
          </View>

          {locked ? (
            <View style={styles.lockedCard}>
              <Icon name="lock-outline" size={28} color={COLORS.primary} />
              <View style={styles.lockedBody}>
                <Text style={styles.lockedTitle}>Login required</Text>
                <Text style={styles.lockedText}>Study is available only inside the logged-in RadioTEDU app.</Text>
              </View>
              <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Auth', {screen: 'Login'})}>
                <Text style={styles.loginText}>Login</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {STUDY_LOCATION_CARDS.map((location) => (
            <TouchableOpacity
              key={location.id}
              style={[styles.locationCard, locked && styles.locationCardDisabled]}
              disabled={locked}
              onPress={() => navigation.navigate('StudyRoom', {locationId: location.id})}>
              <View style={styles.locationIcon}>
                <Icon name={location.icon} size={26} color={COLORS.primary} />
              </View>
              <View style={styles.locationBody}>
                <Text style={styles.locationTitle}>{location.title}</Text>
                <Text style={styles.locationSubtitle}>{location.subtitle}</Text>
              </View>
              <Icon name="chevron-right" size={26} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </PageTransition>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {padding: SPACING.lg, paddingBottom: SPACING.xl},
  header: {marginBottom: SPACING.lg},
  kicker: {color: COLORS.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase'},
  title: {color: COLORS.text, fontSize: 28, fontWeight: '900', marginTop: SPACING.sm},
  subtitle: {color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm},
  lockedCard: {flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md},
  lockedBody: {flex: 1},
  lockedTitle: {color: COLORS.text, fontSize: 14, fontWeight: '900'},
  lockedText: {color: COLORS.textMuted, fontSize: 12, marginTop: 3},
  loginButton: {backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm},
  loginText: {color: '#fff', fontWeight: '900'},
  locationCard: {flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 96, padding: SPACING.md, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md},
  locationCardDisabled: {opacity: 0.45},
  locationIcon: {width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(227,30,36,0.12)'},
  locationBody: {flex: 1},
  locationTitle: {color: COLORS.text, fontSize: 17, fontWeight: '900'},
  locationSubtitle: {color: COLORS.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4},
});

export default StudyHomeScreen;
