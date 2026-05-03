import React, {useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';

const LANES = ['Sol', 'Orta', 'Sağ'];
const TOTAL_BEATS = 24;

const RhythmTapScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [activeLane, setActiveLane] = useState(1);
  const [beat, setBeat] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [misses, setMisses] = useState(0);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);
  const scoreRef = useRef(0);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!running || finished) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMisses((value) => value + 1);
      setStreak(0);
      advanceBeat();
    }, 1200);

    return () => clearInterval(timer);
  });

  const advanceBeat = () => {
    setBeat((current) => {
      if (current >= TOTAL_BEATS) {
        finishGame();
        return current;
      }
      setActiveLane(Math.floor(Math.random() * LANES.length));
      return current + 1;
    });
  };

  const handleTap = (laneIndex: number) => {
    if (!running || finished) {
      return;
    }

    if (laneIndex === activeLane) {
      const nextStreak = streak + 1;
      const nextScore = scoreRef.current + 30 + Math.min(nextStreak, 8) * 5;
      scoreRef.current = nextScore;
      setScore(nextScore);
      setStreak(nextStreak);
    } else {
      setMisses((value) => value + 1);
      setStreak(0);
    }

    advanceBeat();
  };

  const finishGame = async () => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setRunning(false);
    setFinished(true);
    try {
      await submitMobileGameScore({
        game,
        score: scoreRef.current,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      });
    } catch (error) {
      console.error('Rhythm score submit failed:', error);
      Alert.alert('Hata', 'Skor gönderilemedi.');
    }
  };

  const resetGame = () => {
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    submittedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setBeat(1);
    setMisses(0);
    setStreak(0);
    setActiveLane(1);
    setFinished(false);
    setRunning(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Ritim Tap</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.scoreLabel}>Skor</Text>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.helpText}>Parlayan alanı ritim kaçmadan yakala.</Text>
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.metaText}>Beat {beat}/{TOTAL_BEATS}</Text>
        <Text style={styles.metaText}>Seri {streak}</Text>
        <Text style={styles.metaText}>Kaçan {misses}</Text>
      </View>

      <View style={styles.laneRow}>
        {LANES.map((lane, index) => (
          <TouchableOpacity
            key={lane}
            style={[styles.lane, activeLane === index && styles.activeLane]}
            onPress={() => handleTap(index)}
            activeOpacity={0.78}>
            <Icon name="music-note-eighth" size={32} color={activeLane === index ? '#111' : COLORS.textMuted} />
            <Text style={[styles.laneText, activeLane === index && styles.activeLaneText]}>{lane}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {finished ? (
        <TouchableOpacity style={styles.restartButton} onPress={resetGame}>
          <Text style={styles.restartText}>Tekrar Oyna</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg},
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  hero: {padding: SPACING.lg, borderRadius: 26, backgroundColor: '#1D0B20', borderWidth: 1, borderColor: 'rgba(227,30,36,0.35)'},
  scoreLabel: {color: COLORS.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  scoreValue: {color: COLORS.primary, fontSize: 48, fontWeight: '900'},
  helpText: {color: COLORS.textMuted, fontSize: 14},
  progressRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.lg},
  metaText: {color: COLORS.textMuted, fontSize: 13, fontWeight: '800'},
  laneRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl},
  lane: {flex: 1, height: 210, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  activeLane: {backgroundColor: '#F4C542', borderColor: '#F4C542'},
  laneText: {color: COLORS.textMuted, fontSize: 15, fontWeight: '900', marginTop: SPACING.sm},
  activeLaneText: {color: '#111'},
  restartButton: {height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  restartText: {color: '#fff', fontSize: 15, fontWeight: '900'},
});

export default RhythmTapScreen;
