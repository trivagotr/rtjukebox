import React, {useMemo, useRef, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';

type Question = {
  prompt: string;
  answer: string;
  options: string[];
};

const QUESTIONS: Question[] = [
  {prompt: 'Shape of You şarkısının sanatçısı kim?', answer: 'Ed Sheeran', options: ['Ed Sheeran', 'The Weeknd', 'Dua Lipa', 'Coldplay']},
  {prompt: 'Blinding Lights kime ait?', answer: 'The Weeknd', options: ['The Weeknd', 'Bruno Mars', 'Daft Punk', 'Adele']},
  {prompt: 'Levitating şarkısını kim söylüyor?', answer: 'Dua Lipa', options: ['Dua Lipa', 'Billie Eilish', 'Rihanna', 'Sia']},
  {prompt: 'Bohemian Rhapsody hangi gruba ait?', answer: 'Queen', options: ['Queen', 'Muse', 'Nirvana', 'Radiohead']},
  {prompt: 'Someone Like You şarkısının sanatçısı kim?', answer: 'Adele', options: ['Adele', 'Lana Del Rey', 'Beyonce', 'Taylor Swift']},
  {prompt: 'Yellow hangi grubun şarkısı?', answer: 'Coldplay', options: ['Coldplay', 'Oasis', 'U2', 'Imagine Dragons']},
  {prompt: 'Bad Guy şarkısını kim söylüyor?', answer: 'Billie Eilish', options: ['Billie Eilish', 'Lorde', 'Halsey', 'Miley Cyrus']},
  {prompt: 'Get Lucky hangi ikili/grup ile bilinir?', answer: 'Daft Punk', options: ['Daft Punk', 'Justice', 'Disclosure', 'Calvin Harris']},
];

const WordGuessScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [questions, setQuestions] = useState<Question[]>(() => shuffle(QUESTIONS).slice(0, 6));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  const currentQuestion = questions[index];
  const score = useMemo(() => correct * 120, [correct]);

  const answer = (option: string) => {
    if (selected || finished) {
      return;
    }

    const isCorrect = option === currentQuestion.answer;
    setSelected(option);
    if (isCorrect) {
      setCorrect((value) => value + 1);
    }

    setTimeout(() => {
      if (index >= questions.length - 1) {
        const finalCorrect = correct + (isCorrect ? 1 : 0);
        finishGame(finalCorrect * 120);
        return;
      }

      setIndex((value) => value + 1);
      setSelected(null);
    }, 760);
  };

  const finishGame = async (finalScore: number) => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setFinished(true);
    try {
      await submitMobileGameScore({
        game,
        score: finalScore,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      });
    } catch (error) {
      console.error('Word guess score submit failed:', error);
      Alert.alert('Hata', 'Skor gönderilemedi.');
    }
  };

  const resetGame = () => {
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    submittedRef.current = false;
    setQuestions(shuffle(QUESTIONS).slice(0, 6));
    setIndex(0);
    setCorrect(0);
    setSelected(null);
    setFinished(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Şarkı Tahmin</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.meta}>Soru {Math.min(index + 1, questions.length)}/{questions.length}</Text>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.scoreLabel}>Skor</Text>
        </View>

        {!finished ? (
          <View style={styles.questionCard}>
            <Icon name="head-question-outline" size={34} color={COLORS.primary} />
            <Text style={styles.prompt}>{currentQuestion.prompt}</Text>
            {currentQuestion.options.map((option) => {
              const isSelected = selected === option;
              const isAnswer = option === currentQuestion.answer;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.option,
                    selected && isAnswer && styles.correctOption,
                    isSelected && !isAnswer && styles.wrongOption,
                  ]}
                  onPress={() => answer(option)}
                  activeOpacity={0.82}>
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedTitle}>Tur bitti</Text>
            <Text style={styles.finishedText}>{questions.length} soruda {correct} doğru yaptın.</Text>
            <TouchableOpacity style={styles.restartButton} onPress={resetGame}>
              <Text style={styles.restartText}>Tekrar Oyna</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

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
  hero: {padding: SPACING.lg, borderRadius: 26, backgroundColor: '#23090B', borderWidth: 1, borderColor: 'rgba(227,30,36,0.35)'},
  meta: {color: COLORS.textMuted, fontSize: 13, fontWeight: '800'},
  score: {color: COLORS.primary, fontSize: 48, fontWeight: '900', marginTop: SPACING.xs},
  scoreLabel: {color: COLORS.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  questionCard: {marginTop: SPACING.lg, padding: SPACING.md, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  prompt: {color: COLORS.text, fontSize: 22, fontWeight: '900', lineHeight: 29, marginVertical: SPACING.lg},
  option: {minHeight: 52, borderRadius: 16, justifyContent: 'center', paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm},
  correctOption: {borderColor: COLORS.success, backgroundColor: 'rgba(52,199,89,0.16)'},
  wrongOption: {borderColor: COLORS.error, backgroundColor: 'rgba(255,59,48,0.14)'},
  optionText: {color: COLORS.text, fontSize: 15, fontWeight: '800'},
  finishedCard: {marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  finishedTitle: {color: COLORS.text, fontSize: 24, fontWeight: '900'},
  finishedText: {color: COLORS.textMuted, fontSize: 15, marginTop: SPACING.sm},
  restartButton: {height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  restartText: {color: '#fff', fontSize: 15, fontWeight: '900'},
});

export default WordGuessScreen;
