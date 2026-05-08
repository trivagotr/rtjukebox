import React, {useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';
import {ComboMeter, FeedbackToast, GameResultModal, GameShell} from './GameChrome';

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
  const [streak, setStreak] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [awardedXp, setAwardedXp] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  const currentQuestion = questions[index];
  const score = useMemo(() => correct * 120 + Math.max(0, streak - 1) * 25, [correct, streak]);

  const submitFinalScore = async (finalScore: number) => {
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
      console.error('Word guess score submit failed:', error);
      setSubmitFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const answer = (option: string) => {
    if (selected || finished) {
      return;
    }

    const isCorrect = option === currentQuestion.answer;
    setSelected(option);
    let nextCorrect = correct;
    let nextStreak = streak;
    if (isCorrect) {
      nextCorrect += 1;
      nextStreak += 1;
      setFeedback(`Doğru! Seri x${nextStreak}`);
      Vibration.vibrate(18);
    } else {
      nextStreak = 1;
      setFeedback('Yanlış cevap');
    }
    setCorrect(nextCorrect);
    setStreak(nextStreak);

    setTimeout(() => {
      if (index >= questions.length - 1) {
        const finalScore = nextCorrect * 120 + Math.max(0, nextStreak - 1) * 25;
        finishGame(finalScore);
        return;
      }

      setIndex((value) => value + 1);
      setSelected(null);
    }, 760);
  };

  const finishGame = (finalScore: number) => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setFinished(true);
    submitFinalScore(finalScore);
  };

  const resetGame = () => {
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    submittedRef.current = false;
    setQuestions(shuffle(QUESTIONS).slice(0, 6));
    setIndex(0);
    setCorrect(0);
    setStreak(1);
    setSelected(null);
    setFinished(false);
    setAwardedXp(0);
    setSubmitFailed(false);
    setIsSubmitting(false);
    setFeedback(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <GameShell
        title="Şarkı Tahmin"
        subtitle="Artist bilgisi"
        score={score}
        progressLabel={`Soru ${Math.min(index + 1, questions.length)}/${questions.length}`}
        rightLabel={`${correct} doğru`}
        onBack={() => navigation.goBack()}>
        <FeedbackToast text={feedback} />
        <ComboMeter label="Bilgi serisi" value={streak} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <View style={styles.waitCard}>
              <Text style={styles.waitText}>Sonuç kaydediliyor...</Text>
            </View>
          )}
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
  questionCard: {marginTop: SPACING.lg, padding: SPACING.md, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  prompt: {color: COLORS.text, fontSize: 22, fontWeight: '900', lineHeight: 29, marginVertical: SPACING.lg},
  option: {minHeight: 52, borderRadius: 16, justifyContent: 'center', paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm},
  correctOption: {borderColor: COLORS.success, backgroundColor: 'rgba(52,199,89,0.16)'},
  wrongOption: {borderColor: COLORS.error, backgroundColor: 'rgba(255,59,48,0.14)'},
  optionText: {color: COLORS.text, fontSize: 15, fontWeight: '800'},
  waitCard: {padding: SPACING.lg, borderRadius: 24, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg},
  waitText: {color: COLORS.textMuted, textAlign: 'center', fontWeight: '800'},
});

export default WordGuessScreen;
