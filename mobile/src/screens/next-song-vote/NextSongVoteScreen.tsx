import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import GlobalHeader from '../../components/GlobalHeader';
import PageTransition from '../../components/PageTransition';
import {COLORS, SPACING} from '../../theme/theme';
import NextSongVotePanel from './NextSongVotePanel';

export default function NextSongVoteScreen() {
  return (
    <PageTransition>
      <SafeAreaView style={styles.container}>
        <GlobalHeader />
        <View style={styles.header}>
          <Text style={styles.title}>Sıradaki Şarkı</Text>
          <Text style={styles.subtitle}>Yayın akışında çalacak parçayı oyla.</Text>
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
