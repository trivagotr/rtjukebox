import React, {useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';

type Point = {x: number; y: number};
type Direction = 'up' | 'down' | 'left' | 'right';

const BOARD_SIZE = 14;
const START_SNAKE: Point[] = [{x: 6, y: 7}, {x: 5, y: 7}, {x: 4, y: 7}];

const SnakeScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [snake, setSnake] = useState<Point[]>(START_SNAKE);
  const [food, setFood] = useState<Point>(() => createFood(START_SNAKE));
  const [direction, setDirection] = useState<Direction>('right');
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const directionRef = useRef<Direction>('right');
  const scoreRef = useRef(0);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    if (!running || gameOver) {
      return undefined;
    }

    const timer = setInterval(() => {
      setSnake((current) => {
        const head = current[0];
        const nextHead = getNextHead(head, directionRef.current);
        const bodyWithoutTail = current.slice(0, -1);

        if (
          nextHead.x < 0 ||
          nextHead.y < 0 ||
          nextHead.x >= BOARD_SIZE ||
          nextHead.y >= BOARD_SIZE ||
          bodyWithoutTail.some((part) => samePoint(part, nextHead))
        ) {
          finishGame();
          return current;
        }

        const ateFood = samePoint(nextHead, food);
        const nextSnake = ateFood ? [nextHead, ...current] : [nextHead, ...current.slice(0, -1)];
        if (ateFood) {
          const nextScore = scoreRef.current + 10;
          scoreRef.current = nextScore;
          setScore(nextScore);
          setFood(createFood(nextSnake));
        }

        return nextSnake;
      });
    }, 230);

    return () => clearInterval(timer);
  }, [food, gameOver, running]);

  const finishGame = async () => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setRunning(false);
    setGameOver(true);
    try {
      await submitMobileGameScore({
        game,
        score: scoreRef.current,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      });
    } catch (error) {
      console.error('Snake score submit failed:', error);
      Alert.alert('Hata', 'Skor gönderilemedi.');
    }
  };

  const resetGame = () => {
    const nextSnake = START_SNAKE;
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    submittedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setDirection('right');
    setSnake(nextSnake);
    setFood(createFood(nextSnake));
    setGameOver(false);
    setRunning(true);
  };

  const setSafeDirection = (next: Direction) => {
    const current = directionRef.current;
    if (
      (current === 'up' && next === 'down') ||
      (current === 'down' && next === 'up') ||
      (current === 'left' && next === 'right') ||
      (current === 'right' && next === 'left')
    ) {
      return;
    }

    setDirection(next);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Snake" onBack={() => navigation.goBack()} />
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Skor</Text>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.helpText}>Yemeği topla, duvara veya kendine çarpma.</Text>
      </View>

      <View style={styles.board}>
        {Array.from({length: BOARD_SIZE}).map((_, y) => (
          <View key={y} style={styles.row}>
            {Array.from({length: BOARD_SIZE}).map((__, x) => {
              const isSnake = snake.some((part) => part.x === x && part.y === y);
              const isHead = snake[0]?.x === x && snake[0]?.y === y;
              const isFood = food.x === x && food.y === y;
              return (
                <View
                  key={`${x}-${y}`}
                  style={[
                    styles.cell,
                    isSnake && styles.snakeCell,
                    isHead && styles.snakeHead,
                    isFood && styles.foodCell,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.controls}>
        <ControlButton icon="arrow-up-bold" onPress={() => setSafeDirection('up')} />
        <View style={styles.controlRow}>
          <ControlButton icon="arrow-left-bold" onPress={() => setSafeDirection('left')} />
          <TouchableOpacity style={styles.pauseButton} onPress={() => setRunning((value) => !value)} disabled={gameOver}>
            <Icon name={running ? 'pause' : 'play'} size={26} color="#fff" />
          </TouchableOpacity>
          <ControlButton icon="arrow-right-bold" onPress={() => setSafeDirection('right')} />
        </View>
        <ControlButton icon="arrow-down-bold" onPress={() => setSafeDirection('down')} />
      </View>

      {gameOver ? (
        <TouchableOpacity style={styles.restartButton} onPress={resetGame}>
          <Text style={styles.restartText}>Tekrar Oyna</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
};

function Header({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.navbar}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Icon name="chevron-left" size={30} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.navbarTitle}>{title}</Text>
      <View style={styles.navbarSpacer} />
    </View>
  );
}

function ControlButton({icon, onPress}: {icon: string; onPress: () => void}) {
  return (
    <TouchableOpacity style={styles.controlButton} onPress={onPress}>
      <Icon name={icon} size={28} color={COLORS.text} />
    </TouchableOpacity>
  );
}

function getNextHead(head: Point, direction: Direction): Point {
  if (direction === 'up') {
    return {x: head.x, y: head.y - 1};
  }
  if (direction === 'down') {
    return {x: head.x, y: head.y + 1};
  }
  if (direction === 'left') {
    return {x: head.x - 1, y: head.y};
  }
  return {x: head.x + 1, y: head.y};
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function createFood(snake: Point[]): Point {
  const available: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) {
        available.push({x, y});
      }
    }
  }

  return available[Math.floor(Math.random() * available.length)] || {x: 0, y: 0};
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg},
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  scoreCard: {padding: SPACING.md, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  scoreLabel: {color: COLORS.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  scoreValue: {color: COLORS.primary, fontSize: 42, fontWeight: '900'},
  helpText: {color: COLORS.textMuted, fontSize: 13},
  board: {alignSelf: 'center', marginTop: SPACING.lg, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border},
  row: {flexDirection: 'row'},
  cell: {width: 22, height: 22, backgroundColor: '#171717', borderWidth: 0.5, borderColor: '#242424'},
  snakeCell: {backgroundColor: COLORS.primary},
  snakeHead: {backgroundColor: '#FFB020'},
  foodCell: {backgroundColor: '#34C759'},
  controls: {alignItems: 'center', marginTop: SPACING.xl, gap: SPACING.sm},
  controlRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  controlButton: {width: 62, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  pauseButton: {width: 62, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary},
  restartButton: {height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  restartText: {color: '#fff', fontSize: 15, fontWeight: '900'},
});

export default SnakeScreen;
