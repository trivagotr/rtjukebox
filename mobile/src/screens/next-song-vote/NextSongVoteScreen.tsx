import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AuthGuard from '../../components/AuthGuard';
import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';
import {useAuth} from '../../context/AuthContext';
import {useTranslation} from '../../i18n';
import {COLORS, SPACING} from '../../theme/theme';
import NextSongVotePanel from './NextSongVotePanel';

export default function NextSongVoteScreen() {
  const {user} = useAuth();
  const {t} = useTranslation();
  const isRegisteredUser = Boolean(user && !user.is_guest);

  if (!isRegisteredUser) {
    return (
      <AuthGuard
        title={t('nextSongVote.authTitle')}
        message={t('nextSongVote.authMessage')}
        icon="vote-outline"
      />
    );
  }

  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <View style={styles.header}>
          <Text style={styles.title}>{t('nextSongVote.title')}</Text>
          <Text style={styles.subtitle}>{t('nextSongVote.screenSubtitle')}</Text>
        </View>
        <NextSongVotePanel />
      </SafeAreaView>
    </PageTransition>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
});
