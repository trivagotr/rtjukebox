import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, Vibration, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';
import {ComboMeter, FeedbackToast, GameResultModal, GameShell} from './GameChrome';

const LANES = ['Sol', 'Orta', 'Sağ'];
const TOTAL_BEATS = 28;

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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [awardedXp, setAwardedXp] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());
  const beatStartedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!running || finished) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMisses((value) => value + 1);
      streakRef.current = 0;
      setStreak(0);
      setFeedback('Miss');
      advanceBeat();
    }, 1100);

    return () => clearInterval(timer);
  });

  const submitFinalScore = async (finalScore = scoreRef.current) => {
    setIsSubmitting(true);
    setSubmitFailed(false);
    try {
      const result: any = await submitMobileGameScore({
        game,
        score: finalScore,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      });
      setAwardedXp(Number(result?.points_awarded ?? 0));
    } catch (error) {
      console.error('Rhythm score submit failed:', error);
      setSubmitFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const advanceBeat = () => {
    setBeat((current) => {
      if (current >= TOTAL_BEATS) {
        finishGame();
        return current;
      }
      beatStartedAtRef.current = Date.now();
      setActiveLane(Math.floor(Math.random() * LANES.length));
      return current + 1;
    });
  };

  const handleTap = (laneIndex: number) => {
    if (!running || finished) {
      return;
    }

    if (laneIndex === activeLane) {
      const latency = Date.now() - beatStartedAtRef.current;
      const judgement = latency < 420 ? 'Perfect' : 'Good';
      const nextStreak = streakRef.current + 1;
      const gained = judgement === 'Perfect' ? 42 + nextStreak * 4 : 28 + nextStreak * 3;
      const nextScore = scoreRef.current + gained;
      scoreRef.current = nextScore;
      streakRef.current = nextStreak;
      setScore(nextScore);
      setStreak(nextStreak);
      setFeedback(`${judgement} +${gained}`);
      Vibration.vibrate(judgement === 'Perfect' ? 12 : 20);
    } else {
      setMisses((value) => value + 1);
      streakRef.current = 0;
      setStreak(0);
      setFeedback('Wrong lane');
    }

    advanceBeat();
  };

  const finishGame = () => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setRunning(false);
    setFinished(true);
    submitFinalScore(scoreRef.current);
  };

  const resetGame = () => {
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    beatStartedAtRef.current = Date.now();
    submittedRef.current = false;
    scoreRef.current = 0;
    streakRef.current = 0;
    setScore(0);
    setBeat(1);
    setMisses(0);
    setStreak(0);
    setActiveLane(1);
    setFinished(false);
    setRunning(true);
    setAwardedXp(0);
    setSubmitFailed(false);
    setIsSubmitting(false);
    setFeedback(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <GameShell
        title="Ritim Tap"
        subtitle="Beat yakalama"
        score={score}
        progressLabel={`Beat ${beat}/${TOTAL_BEATS}`}
        rightLabel={`${misses} kaçan`}
        onBack={() => navigation.goBack()}>
        <FeedbackToast text={feedback} />
        <ComboMeter label="Ritim serisi" value={Math.max(1, streak)} />

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
        <TouchableOpacity style={styles.pauseButton} onPress={() => setRunning((value) => !value)} disabled={finished}>
          <Icon name={running ? 'pause' : 'play'} size={22} color="#fff" />
          <Text style={styles.pauseText}>{running ? 'Duraklat' : 'Devam'}</Text>
        </TouchableOpacity>
      </GameShell>

      <GameResultModal
        visible={finished}
        score={score}
        awardedXp={awardedXp}
        isSubmitting={isSubmitting}
        submitFailed={submitFailed}
        onRetrySubmit={() => submitFinalScore(score)}
        onRestart={resetGame}
        onExit={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  laneRow: {flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl},
  lane: {flex: 1, height: 230, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  activeLane: {backgroundColor: '#F4C542', borderColor: '#F4C542'},
  laneText: {color: COLORS.textMuted, fontSize: 15, fontWeight: '900', marginTop: SPACING.sm},
  activeLaneText: {color: '#111'},
  pauseButton: {height: 48, borderRadius: 16, flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  pauseText: {color: '#fff', fontSize: 14, fontWeight: '900'},
});

export default RhythmTapScreen;
