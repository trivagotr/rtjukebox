import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';
import {ComboMeter, FeedbackToast, GameResultModal, GameShell} from './GameChrome';

type MemoryCard = {
  id: string;
  symbol: string;
  matched: boolean;
};

const SYMBOLS = ['MIC', 'DJ', 'FM', 'XP', 'POP', 'ROCK', 'LIVE', 'TEDU'];

const MemoryGameScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [cards, setCards] = useState<MemoryCard[]>(() => createDeck());
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(1);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [awardedXp, setAwardedXp] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  const matchedCount = useMemo(() => cards.filter((card) => card.matched).length, [cards]);
  const score = Math.max(0, matchedCount * 80 - moves * 3 + combo * 12);

  const submitFinalScore = useCallback(async (finalScore = score) => {
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
      console.error('Memory score submit failed:', error);
      setSubmitFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [game, score]);

  useEffect(() => {
    if (matchedCount === cards.length && cards.length > 0 && !submittedRef.current) {
      submittedRef.current = true;
      setFinished(true);
      submitFinalScore(score);
    }
  }, [cards.length, matchedCount, score, submitFinalScore]);

  const handleFlip = (card: MemoryCard) => {
    if (locked || finished || card.matched || flippedIds.includes(card.id)) {
      return;
    }

    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length === 2) {
      setLocked(true);
      setMoves((value) => value + 1);
      const [first, second] = nextFlipped.map((id) => cards.find((item) => item.id === id));
      const isMatch = first?.symbol === second?.symbol;

      setTimeout(() => {
        if (isMatch) {
          const nextCombo = combo + 1;
          setCombo(nextCombo);
          setFeedback(`Eşleşme! Combo x${nextCombo}`);
          Vibration.vibrate(18);
          setCards((current) =>
            current.map((item) => nextFlipped.includes(item.id) ? {...item, matched: true} : item),
          );
        } else {
          setCombo(1);
          setFeedback('Kaçtı');
        }
        setFlippedIds([]);
        setLocked(false);
      }, 620);
    }
  };

  const resetGame = () => {
    submittedRef.current = false;
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    setCards(createDeck());
    setFlippedIds([]);
    setMoves(0);
    setCombo(1);
    setLocked(false);
    setFinished(false);
    setAwardedXp(0);
    setSubmitFailed(false);
    setIsSubmitting(false);
    setFeedback(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <GameShell
        title="Hafıza Kartları"
        subtitle="Kart eşleştirme"
        score={score}
        progressLabel={`${matchedCount / 2}/${cards.length / 2} eşleşme`}
        rightLabel={`${moves} hamle`}
        onBack={() => navigation.goBack()}>
        <FeedbackToast text={feedback} />
        <ComboMeter label="Hafıza serisi" value={combo} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {cards.map((card) => {
              const isVisible = card.matched || flippedIds.includes(card.id);
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.card, isVisible && styles.cardVisible, card.matched && styles.cardMatched]}
                  onPress={() => handleFlip(card)}
                  activeOpacity={0.82}>
                  <Text style={styles.cardText}>{isVisible ? card.symbol : '?'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.helpText}>Daha az hamle ve üst üste eşleşme daha fazla skor getirir.</Text>
        </ScrollView>
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

function createDeck(): MemoryCard[] {
  return shuffle(
    SYMBOLS.flatMap((symbol, index) => [
      {id: `${index}-a`, symbol, matched: false},
      {id: `${index}-b`, symbol, matched: false},
    ]),
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {paddingBottom: SPACING.xl},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg, justifyContent: 'center'},
  card: {width: '22%', aspectRatio: 0.82, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  cardVisible: {backgroundColor: '#2A0709', borderColor: COLORS.primary},
  cardMatched: {backgroundColor: 'rgba(52,199,89,0.16)', borderColor: COLORS.success},
  cardText: {fontSize: 18, color: COLORS.text, fontWeight: '900'},
  helpText: {color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: SPACING.lg},
});

export default MemoryGameScreen;
