import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS, SPACING} from '../../theme/theme';
import {ArcadeGame} from '../../services/gamificationService';
import {createClientRoundId, submitMobileGameScore} from './gameSession';

type Cell = {x: number; y: number};
type Piece = {shape: Cell[]; x: number; y: number; color: string};

const WIDTH = 8;
const HEIGHT = 14;
const SHAPES: Array<{shape: Cell[]; color: string}> = [
  {color: COLORS.primary, shape: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}]},
  {color: '#FFB020', shape: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 0, y: 3}]},
  {color: '#34C759', shape: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 2, y: 1}]},
  {color: '#5AC8FA', shape: [{x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 2, y: 1}]},
];

const TetrisScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const game = route.params?.game as ArcadeGame;
  const [occupied, setOccupied] = useState<Record<string, string>>({});
  const [piece, setPiece] = useState<Piece>(() => createPiece());
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const submittedRef = useRef(false);
  const roundIdRef = useRef(createClientRoundId(game));
  const startedAtRef = useRef(Date.now());

  const activeCells = useMemo(() => getPieceCells(piece), [piece]);

  useEffect(() => {
    if (!running || gameOver) {
      return undefined;
    }

    const timer = setInterval(() => {
      moveDown();
    }, 520);

    return () => clearInterval(timer);
  });

  const finishGame = async (finalScore: number = score) => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setRunning(false);
    setGameOver(true);
    try {
      await submitMobileGameScore({
        game,
        score: finalScore,
        clientRoundId: roundIdRef.current,
        startedAt: startedAtRef.current,
      });
    } catch (error) {
      console.error('Tetris score submit failed:', error);
      Alert.alert('Hata', 'Skor gönderilemedi.');
    }
  };

  const lockPiece = (currentPiece: Piece, currentOccupied: Record<string, string>) => {
    const nextOccupied = {...currentOccupied};
    getPieceCells(currentPiece).forEach((cell) => {
      nextOccupied[keyOf(cell)] = currentPiece.color;
    });

    const {grid, clearedRows} = clearRows(nextOccupied);
    const nextScore = score + 15 + clearedRows * 120;
    setScore(nextScore);
    const nextPiece = createPiece();

    if (collides(nextPiece, grid)) {
      setOccupied(grid);
      finishGame(nextScore);
      return;
    }

    setOccupied(grid);
    setPiece(nextPiece);
  };

  const moveDown = () => {
    const nextPiece = {...piece, y: piece.y + 1};
    if (collides(nextPiece, occupied)) {
      lockPiece(piece, occupied);
      return;
    }

    setPiece(nextPiece);
  };

  const moveHorizontal = (delta: number) => {
    setPiece((current) => {
      const nextPiece = {...current, x: current.x + delta};
      return collides(nextPiece, occupied) ? current : nextPiece;
    });
  };

  const rotate = () => {
    setPiece((current) => {
      const nextPiece = {
        ...current,
        shape: current.shape.map((cell) => ({x: -cell.y + 1, y: cell.x})),
      };
      return collides(nextPiece, occupied) ? current : nextPiece;
    });
  };

  const drop = () => {
    let nextPiece = piece;
    while (!collides({...nextPiece, y: nextPiece.y + 1}, occupied)) {
      nextPiece = {...nextPiece, y: nextPiece.y + 1};
    }
    lockPiece(nextPiece, occupied);
  };

  const resetGame = () => {
    roundIdRef.current = createClientRoundId(game);
    startedAtRef.current = Date.now();
    submittedRef.current = false;
    setOccupied({});
    setPiece(createPiece());
    setScore(0);
    setGameOver(false);
    setRunning(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Bloklar</Text>
        <View style={styles.navbarSpacer} />
      </View>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Skor</Text>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.helpText}>Satırları doldur, bloklar tepeye değmeden devam et.</Text>
      </View>

      <View style={styles.board}>
        {Array.from({length: HEIGHT}).map((_, y) => (
          <View key={y} style={styles.row}>
            {Array.from({length: WIDTH}).map((__, x) => {
              const key = keyOf({x, y});
              const active = activeCells.some((cell) => cell.x === x && cell.y === y);
              return (
                <View
                  key={key}
                  style={[
                    styles.cell,
                    occupied[key] ? {backgroundColor: occupied[key]} : null,
                    active ? {backgroundColor: piece.color} : null,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={() => moveHorizontal(-1)} disabled={gameOver}>
          <Icon name="arrow-left-bold" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={rotate} disabled={gameOver}>
          <Icon name="rotate-right" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={() => moveHorizontal(1)} disabled={gameOver}>
          <Icon name="arrow-right-bold" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dropButton} onPress={drop} disabled={gameOver}>
          <Text style={styles.dropText}>Bırak</Text>
        </TouchableOpacity>
      </View>

      {gameOver ? (
        <TouchableOpacity style={styles.restartButton} onPress={resetGame}>
          <Text style={styles.restartText}>Tekrar Oyna</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
};

function createPiece(): Piece {
  const item = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return {
    shape: item.shape,
    color: item.color,
    x: 3,
    y: 0,
  };
}

function getPieceCells(piece: Piece): Cell[] {
  return piece.shape.map((cell) => ({x: cell.x + piece.x, y: cell.y + piece.y}));
}

function collides(piece: Piece, occupied: Record<string, string>) {
  return getPieceCells(piece).some((cell) => (
    cell.x < 0 ||
    cell.x >= WIDTH ||
    cell.y < 0 ||
    cell.y >= HEIGHT ||
    Boolean(occupied[keyOf(cell)])
  ));
}

function clearRows(occupied: Record<string, string>) {
  const fullRows = Array.from({length: HEIGHT})
    .map((_, y) => y)
    .filter((y) => Array.from({length: WIDTH}).every((__, x) => occupied[keyOf({x, y})]));

  if (fullRows.length === 0) {
    return {grid: occupied, clearedRows: 0};
  }

  const grid: Record<string, string> = {};
  Object.entries(occupied).forEach(([key, color]) => {
    const [x, y] = key.split(':').map(Number);
    if (fullRows.includes(y)) {
      return;
    }
    const rowsBelow = fullRows.filter((row) => row > y).length;
    grid[keyOf({x, y: y + rowsBelow})] = color;
  });

  return {grid, clearedRows: fullRows.length};
}

function keyOf(cell: Cell) {
  return `${cell.x}:${cell.y}`;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg},
  navbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)'},
  navbarTitle: {color: COLORS.text, fontSize: 18, fontWeight: '900'},
  navbarSpacer: {width: 44},
  scoreCard: {padding: SPACING.md, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border},
  scoreLabel: {color: COLORS.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  scoreValue: {color: COLORS.primary, fontSize: 40, fontWeight: '900'},
  helpText: {color: COLORS.textMuted, fontSize: 13},
  board: {alignSelf: 'center', marginTop: SPACING.lg, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border},
  row: {flexDirection: 'row'},
  cell: {width: 26, height: 26, backgroundColor: '#171717', borderWidth: 0.5, borderColor: '#252525'},
  controls: {flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg},
  controlButton: {width: 54, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border},
  dropButton: {height: 48, paddingHorizontal: SPACING.lg, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary},
  dropText: {color: '#fff', fontSize: 14, fontWeight: '900'},
  restartButton: {height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, marginTop: SPACING.lg},
  restartText: {color: '#fff', fontSize: 15, fontWeight: '900'},
});

export default TetrisScreen;
