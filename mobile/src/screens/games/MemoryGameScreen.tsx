import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';

type MemoryCard = {
  id: string;
  symbol: string;
  matched: boolean;
};

const SYMBOLS = ['🎙️', '🎧', '🎵', '📻', '⭐', '🎸', '🎚️', '💿'];

const MemoryGameScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [cards, setCards] = useState<MemoryCard[]>(() => createDeck());
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  const matchedCount = useMemo(() => cards.filter((card) => card.matched).length, [cards]);
  const score = Math.max(0, matchedCount * 80 - moves * 3);

  useEffect(() => {
    if (matchedCount === cards.length && cards.length > 0 && !submittedRef.current) {
      submittedRef.current = true;
      setFinished(true);
      submitMobileGameScore({
        game,
        score,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      }).catch((error) => {
        console.error('Memory score submit failed:', error);
        Alert.alert('Hata', 'Skor gönderilemedi.');
      });
    }
  }, [cards.length, game, matchedCount, score]);

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
          setCards((current) =>
            current.map((item) => nextFlipped.includes(item.id) ? {...item, matched: true} : item),
          );
        }
        setFlippedIds([]);
        setLocked(false);
      }, 650);
    }
  };

  const resetGame = () => {
    submittedRef.current = false;
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    setCards(createDeck());
    setFlippedIds([]);
    setMoves(0);
    setLocked(false);
    setFinished(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Hafıza Kartları</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.scoreCard}>
          <View>
            <Text style={styles.scoreLabel}>Skor</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          <View style={styles.movesBox}>
            <Text style={styles.movesValue}>{moves}</Text>
            <Text style={styles.movesLabel}>Hamle</Text>
          </View>
        </View>

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

        {finished ? (
          <TouchableOpacity style={styles.restartButton} onPress={resetGame}>
            <Text style={styles.restartText}>Tekrar Oyna</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.helpText}>Aynı ikonları eşleştir. Daha az hamle daha yüksek skor getirir.</Text>
        )}
      </ScrollView>
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
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  content: {padding: SPACING.lg, paddingBottom: SPACING.xl},
  scoreCard: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, borderRadius: 22, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  scoreLabel: {color: COLORS.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  scoreValue: {color: COLORS.primary, fontSize: 40, fontWeight: '900'},
  movesBox: {alignItems: 'center', justifyContent: 'center', minWidth: 78, minHeight: 66, borderRadius: 18, backgroundColor: 'rgba(227,30,36,0.12)'},
  movesValue: {color: COLORS.text, fontSize: 22, fontWeight: '900'},
  movesLabel: {color: COLORS.textMuted, fontSize: 11},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg, justifyContent: 'center'},
  card: {width: '22%', aspectRatio: 0.82, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  cardVisible: {backgroundColor: '#2A0709', borderColor: COLORS.primary},
  cardMatched: {backgroundColor: 'rgba(52,199,89,0.16)', borderColor: COLORS.success},
  cardText: {fontSize: 28, color: COLORS.text, fontWeight: '900'},
  restartButton: {height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  restartText: {color: '#fff', fontSize: 15, fontWeight: '900'},
  helpText: {color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: SPACING.lg},
});

export default MemoryGameScreen;
