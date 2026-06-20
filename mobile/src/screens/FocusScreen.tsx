import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {useActiveTrack} from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../theme/theme';
import {playChannelById} from '../services/playbackQueue';
import {DEFAULT_STREAM_QUALITY} from '../services/config';

type Phase = 'work' | 'shortBreak' | 'longBreak';

const DURATIONS: Record<Phase, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};
const SESSIONS_BEFORE_LONG_BREAK = 4;
const TASKS_KEY = '@radiotedu/focus_tasks';

// Ambient channels offered for focusing (ids from RADIO_CHANNELS).
const AMBIENT = [
  {id: 'radiotedu-jazz', label: 'Jazz', icon: 'saxophone'},
  {id: 'radiotedu-classic', label: 'Classic', icon: 'music-clef-treble'},
  {id: 'radiotedu-lofi', label: 'Lo-Fi', icon: 'headphones'},
];

type Task = {id: string; text: string; done: boolean};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const FocusScreen = ({navigation}: any) => {
  const {t} = useTranslation();
  const activeTrack = useActiveTrack();

  // --- Pomodoro ---
  const [phase, setPhase] = useState<Phase>('work');
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS.work);
  const [isRunning, setIsRunning] = useState(false);
  const [completedWork, setCompletedWork] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToPhase = useCallback((next: Phase) => {
    setPhase(next);
    setSecondsLeft(DURATIONS[next]);
  }, []);

  const advancePhase = useCallback(() => {
    Vibration.vibrate(400);
    if (phase === 'work') {
      const done = completedWork + 1;
      setCompletedWork(done);
      goToPhase(
        done % SESSIONS_BEFORE_LONG_BREAK === 0 ? 'longBreak' : 'shortBreak',
      );
    } else {
      goToPhase('work');
    }
  }, [phase, completedWork, goToPhase]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  // When the countdown hits zero, move to the next phase.
  useEffect(() => {
    if (secondsLeft === 0 && isRunning) {
      advancePhase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const toggleRun = () => setIsRunning(r => !r);
  const reset = () => {
    setIsRunning(false);
    goToPhase(phase);
  };
  const skip = () => {
    setIsRunning(false);
    advancePhase();
  };

  // --- Tasks ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY)
      .then(raw => {
        if (raw) {
          setTasks(JSON.parse(raw));
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Task[]) => {
    setTasks(next);
    AsyncStorage.setItem(TASKS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addTask = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    persist([{id: `${secondsLeft}-${tasks.length}-${text}`, text, done: false}, ...tasks]);
    setDraft('');
  };
  const toggleTask = (id: string) =>
    persist(tasks.map(x => (x.id === id ? {...x, done: !x.done} : x)));
  const removeTask = (id: string) => persist(tasks.filter(x => x.id !== id));

  // --- Ambient ---
  const playAmbient = (id: string) =>
    playChannelById(id, DEFAULT_STREAM_QUALITY).catch(() => {});

  const phaseColor = phase === 'work' ? COLORS.primary : '#1DB954';
  const totalRounds = SESSIONS_BEFORE_LONG_BREAK;
  const currentRound = (completedWork % SESSIONS_BEFORE_LONG_BREAK) + 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Icon name="arrow-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{t('focus.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('focus.subtitle')}</Text>
        </View>
        <View style={{width: 26}} />
      </View>

      <FlatList
        data={tasks}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Pomodoro timer */}
            <View style={[styles.timerCard, {borderColor: phaseColor}]}>
              <Text style={[styles.phaseLabel, {color: phaseColor}]}>
                {t(`focus.${phase}`)}
              </Text>
              <Text style={styles.timer}>{formatTime(secondsLeft)}</Text>
              <Text style={styles.round}>
                {t('focus.round', {current: currentRound, total: totalRounds})}
              </Text>
              <View style={styles.controls}>
                <TouchableOpacity onPress={reset} style={styles.secondaryBtn}>
                  <Icon name="restart" size={22} color={COLORS.text} />
                  <Text style={styles.secondaryBtnText}>{t('focus.reset')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={toggleRun}
                  style={[styles.primaryBtn, {backgroundColor: phaseColor}]}>
                  <Icon
                    name={isRunning ? 'pause' : 'play'}
                    size={26}
                    color="#fff"
                  />
                  <Text style={styles.primaryBtnText}>
                    {isRunning ? t('focus.pause') : t('focus.start')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={skip} style={styles.secondaryBtn}>
                  <Icon name="skip-next" size={22} color={COLORS.text} />
                  <Text style={styles.secondaryBtnText}>{t('focus.skip')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Ambient sounds */}
            <Text style={styles.sectionTitle}>{t('focus.ambient')}</Text>
            <View style={styles.ambientRow}>
              {AMBIENT.map(a => {
                const active = activeTrack?.id === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => playAmbient(a.id)}
                    style={[styles.ambientBtn, active && styles.ambientBtnActive]}>
                    <Icon
                      name={active ? 'pause-circle' : a.icon}
                      size={26}
                      color={active ? COLORS.primary : COLORS.text}
                    />
                    <Text
                      style={[
                        styles.ambientLabel,
                        active && {color: COLORS.primary},
                      ]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tasks header + input */}
            <Text style={styles.sectionTitle}>{t('focus.tasks')}</Text>
            <View style={styles.taskInputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('focus.addTaskPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                style={styles.taskInput}
                onSubmitEditing={addTask}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={addTask} style={styles.addBtn}>
                <Icon name="plus" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({item}) => (
          <View style={styles.taskRow}>
            <TouchableOpacity
              onPress={() => toggleTask(item.id)}
              style={styles.taskCheck}>
              <Icon
                name={item.done ? 'check-circle' : 'circle-outline'}
                size={24}
                color={item.done ? '#1DB954' : COLORS.textMuted}
              />
              <Text style={[styles.taskText, item.done && styles.taskTextDone]}>
                {item.text}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeTask(item.id)}>
              <Icon name="trash-can-outline" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('focus.noTasks')}</Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {color: COLORS.text, fontSize: 18, fontWeight: 'bold', textAlign: 'center'},
  headerSubtitle: {color: COLORS.textMuted, fontSize: 12, textAlign: 'center'},
  list: {padding: SPACING.md, paddingBottom: SPACING.xl},
  timerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  phaseLabel: {fontSize: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase'},
  timer: {color: COLORS.text, fontSize: 64, fontWeight: '800', marginVertical: SPACING.sm},
  round: {color: COLORS.textMuted, fontSize: 13, marginBottom: SPACING.md},
  controls: {flexDirection: 'row', alignItems: 'center', gap: SPACING.md},
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 30,
  },
  primaryBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  secondaryBtn: {alignItems: 'center', gap: 2},
  secondaryBtnText: {color: COLORS.text, fontSize: 11},
  sectionTitle: {color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: SPACING.sm},
  ambientRow: {flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg},
  ambientBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    gap: 4,
  },
  ambientBtnActive: {borderColor: COLORS.primary},
  ambientLabel: {color: COLORS.text, fontSize: 13, fontWeight: '600'},
  taskInputRow: {flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md},
  taskInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    height: 48,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm,
  },
  taskCheck: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1},
  taskText: {color: COLORS.text, fontSize: 15, flex: 1},
  taskTextDone: {textDecorationLine: 'line-through', color: COLORS.textMuted},
  empty: {color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.md},
});

export default FocusScreen;
