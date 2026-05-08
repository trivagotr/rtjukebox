import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS, SPACING} from '../../theme/theme';
import {getGameResultMessage} from './gameSession';

interface GameShellProps {
  title: string;
  subtitle?: string;
  score: number;
  progressLabel?: string;
  rightLabel?: string;
  onBack: () => void;
  children: React.ReactNode;
}

export function GameShell({
  title,
  subtitle,
  score,
  progressLabel,
  rightLabel,
  onBack,
  children,
}: GameShellProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.navbarTitle}>{title}</Text>
          {subtitle ? <Text style={styles.navbarSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.navbarSpacer} />
      </View>

      <View style={styles.scoreCard}>
        <View>
          <Text style={styles.scoreLabel}>Skor</Text>
          <Text style={styles.scoreValue}>{score}</Text>
        </View>
        <View style={styles.scoreMeta}>
          {progressLabel ? <Text style={styles.progressLabel}>{progressLabel}</Text> : null}
          {rightLabel ? <Text style={styles.rightLabel}>{rightLabel}</Text> : null}
        </View>
      </View>

      {children}
    </View>
  );
}

export function ComboMeter({label, value}: {label: string; value: number}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, {toValue: 1.08, duration: 120, useNativeDriver: true}),
      Animated.timing(scale, {toValue: 1, duration: 140, useNativeDriver: true}),
    ]).start();
  }, [scale, value]);

  return (
    <Animated.View style={[styles.comboMeter, {transform: [{scale}]}]}>
      <Text style={styles.comboLabel}>{label}</Text>
      <Text style={styles.comboValue}>x{value}</Text>
    </Animated.View>
  );
}

export function FeedbackToast({text}: {text?: string | null}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (!text) {
      opacity.setValue(0);
      return;
    }

    translateY.setValue(10);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {toValue: 1, duration: 120, useNativeDriver: true}),
        Animated.timing(translateY, {toValue: 0, duration: 120, useNativeDriver: true}),
      ]),
      Animated.delay(680),
      Animated.timing(opacity, {toValue: 0, duration: 180, useNativeDriver: true}),
    ]).start();
  }, [opacity, text, translateY]);

  if (!text) {
    return null;
  }

  return (
    <Animated.View style={[styles.feedbackToast, {opacity, transform: [{translateY}]}]}>
      <Text style={styles.feedbackText}>{text}</Text>
    </Animated.View>
  );
}

export function GameResultModal({
  visible,
  title = 'Tur bitti',
  score,
  awardedXp,
  isSubmitting,
  submitFailed,
  onRetrySubmit,
  onRestart,
  onExit,
}: {
  visible: boolean;
  title?: string;
  score: number;
  awardedXp: number;
  isSubmitting?: boolean;
  submitFailed?: boolean;
  onRetrySubmit?: () => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.resultCard}>
          <View style={styles.resultIcon}>
            <Icon name={submitFailed ? 'wifi-alert' : 'trophy-award'} size={38} color={COLORS.primary} />
          </View>
          <Text style={styles.resultTitle}>{title}</Text>
          <Text style={styles.resultScore}>{getGameResultMessage(score, awardedXp)}</Text>
          <Text style={styles.resultSubtitle}>
            {isSubmitting
              ? 'Skor sunucuya gönderiliyor...'
              : submitFailed
                ? 'Skor gönderilemedi. Bağlantıyı kontrol edip tekrar dene.'
                : 'Skorun kaydedildi. Yeni turda daha yüksek combo hedefle.'}
          </Text>

          {submitFailed && onRetrySubmit ? (
            <TouchableOpacity style={styles.primaryButton} onPress={onRetrySubmit}>
              <Text style={styles.primaryButtonText}>Tekrar Gönder</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onExit}>
              <Text style={styles.secondaryButtonText}>Oyunlar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onRestart}>
              <Text style={styles.primaryButtonText}>Tekrar Oyna</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerText: {
    alignItems: 'center',
  },
  navbarTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
  },
  navbarSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  navbarSpacer: {
    width: 44,
  },
  scoreCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 24,
    backgroundColor: '#211113',
    borderWidth: 1,
    borderColor: 'rgba(227,30,36,0.28)',
  },
  scoreLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: COLORS.primary,
    fontSize: 42,
    fontWeight: '900',
  },
  scoreMeta: {
    alignItems: 'flex-end',
  },
  progressLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
  rightLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  comboMeter: {
    alignSelf: 'center',
    minWidth: 104,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(244,197,66,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244,197,66,0.45)',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  comboLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  comboValue: {
    color: '#F4C542',
    fontSize: 18,
    fontWeight: '900',
  },
  feedbackToast: {
    alignSelf: 'center',
    position: 'absolute',
    top: 138,
    zIndex: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  resultCard: {
    borderRadius: 30,
    padding: SPACING.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(227,30,36,0.3)',
    alignItems: 'center',
  },
  resultIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,30,36,0.12)',
    marginBottom: SPACING.md,
  },
  resultTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '900',
  },
  resultScore: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: SPACING.sm,
  },
  resultSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  resultActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
    marginTop: SPACING.lg,
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginTop: SPACING.md,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.md,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
  },
});
