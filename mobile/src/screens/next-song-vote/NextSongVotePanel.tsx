import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import io from 'socket.io-client';
import {useTranslation} from '../../i18n';
import { COLORS, SPACING } from '../../theme/theme';
import { SOCKET_ORIGIN, SOCKET_PATH, STORAGE_API } from '../../services/config';
import {
  fetchActiveNextSongVoteRound,
  getCandidateCoverUrl,
  normalizeNextSongVoteRound,
  submitNextSongVote,
  type NextSongVoteCandidate,
  type NextSongVoteRound,
} from '../../services/nextSongVote';

const fallbackArt = require('../../assets/images/radiotedu-signal-logo.png');

interface NextSongVotePanelProps {
  deviceId?: string | null;
}

function secondsUntil(value: string | null | undefined, now: number): number | null {
  if (!value) {
    return null;
  }

  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  return Number.isFinite(seconds) ? seconds : null;
}

function getVoteStatusKey(round: NextSongVoteRound | null): string {
  if (!round) {
    return 'nextSongVote.status.waiting';
  }

  if (round.status === 'open') {
    return 'nextSongVote.status.open';
  }

  if (round.status === 'locked') {
    return 'nextSongVote.status.locked';
  }

  return 'nextSongVote.status.resolved';
}

function CandidateOption({
  candidate,
  disabled,
  isSelected,
  isWinner,
  onPress,
}: {
  candidate: NextSongVoteCandidate;
  disabled: boolean;
  isSelected: boolean;
  isWinner: boolean;
  onPress: () => void;
}) {
  const coverUrl = getCandidateCoverUrl(candidate, STORAGE_API);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.candidateCard,
        isSelected && styles.candidateCardSelected,
        isWinner && styles.candidateCardWinner,
        disabled && styles.candidateCardDisabled,
      ]}
    >
      <Image source={coverUrl ? { uri: coverUrl } : fallbackArt} style={styles.candidateArt} />
      <View style={styles.candidateInfo}>
        <Text style={styles.candidateTitle} numberOfLines={1}>
          {candidate.title}
        </Text>
        <Text style={styles.candidateArtist} numberOfLines={1}>
          {candidate.artist}
        </Text>
      </View>
      <View style={styles.voteBadge}>
        <Icon name={isSelected ? 'check-circle' : 'music-note'} size={16} color={isSelected ? COLORS.primary : COLORS.textMuted} />
        <Text style={[styles.voteCount, isSelected && styles.voteCountSelected]}>{candidate.votes}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NextSongVotePanel({ deviceId }: NextSongVotePanelProps) {
  const {t} = useTranslation();
  const [round, setRound] = useState<NextSongVoteRound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [votingCandidateId, setVotingCandidateId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const loadRound = useCallback(async () => {
    try {
      setIsLoading(true);
      setRound(await fetchActiveNextSongVoteRound(deviceId));
    } catch (error) {
      console.error('Failed to fetch next-song vote round:', error);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_ORIGIN, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      secure: SOCKET_ORIGIN.startsWith('https://'),
      forceNew: true,
      reconnectionAttempts: 10,
    });

    if (deviceId) {
      socket.emit('join_device', deviceId);
    }
    const updateRound = (payload: unknown) => setRound(normalizeNextSongVoteRound(payload));

    socket.on('next_vote_round_started', updateRound);
    socket.on('next_vote_round_updated', updateRound);
    socket.on('next_vote_round_locked', updateRound);
    socket.on('next_vote_round_resolved', updateRound);
    socket.on('next_vote_round_cancelled', () => setRound(null));

    return () => {
      socket.disconnect();
    };
  }, [deviceId]);

  const remainingSeconds = useMemo(() => {
    return secondsUntil(round?.status === 'open' ? round.lockAt : round?.resolveAt, nowTick);
  }, [nowTick, round?.lockAt, round?.resolveAt, round?.status]);

  const voteFor = async (candidateId: string) => {
    if (!round || round.status !== 'open') {
      return;
    }

    try {
      setVotingCandidateId(candidateId);
      const nextRound = await submitNextSongVote(round.id, candidateId, deviceId);
      if (nextRound) {
        setRound(nextRound);
      }
    } catch (error: any) {
      const status = error.response?.status;
      const message =
        status === 403
          ? t('nextSongVote.errors.authRequired')
          : status === 409
            ? t('nextSongVote.errors.roundClosed')
            : error.response?.data?.error || t('nextSongVote.errors.generic');
      Alert.alert(t('nextSongVote.errors.title'), message);
    } finally {
      setVotingCandidateId(null);
    }
  };

  const statusCopy = t(getVoteStatusKey(round));

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Icon name="vote" size={20} color={COLORS.primary} />
          <Text style={styles.title}>{t('nextSongVote.title')}</Text>
        </View>
        {remainingSeconds !== null && (
          <View style={styles.timerPill}>
            <Icon name="timer-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.timerText}>{remainingSeconds}s</Text>
          </View>
        )}
      </View>

      <Text style={styles.subtitle}>{statusCopy}</Text>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : round?.candidates.length ? (
        <View style={styles.candidateList}>
          {round.candidates.map((candidate) => (
            <CandidateOption
              key={candidate.id}
              candidate={candidate}
              disabled={round.status !== 'open' || votingCandidateId !== null}
              isSelected={round.userVoteCandidateId === candidate.id}
              isWinner={round.winnerCandidateId === candidate.id}
              onPress={() => voteFor(candidate.id)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Image source={fallbackArt} style={styles.emptyLogo} />
          <Text style={styles.emptyText}>{t('nextSongVote.empty')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: 'bold',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  timerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },
  loader: {
    paddingVertical: SPACING.md,
  },
  candidateList: {
    gap: SPACING.sm,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  candidateCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(227, 30, 36, 0.08)',
  },
  candidateCardWinner: {
    borderColor: COLORS.success,
  },
  candidateCardDisabled: {
    opacity: 0.82,
  },
  candidateArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  candidateInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  candidateTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  candidateArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  voteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  voteCount: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: 'bold',
    minWidth: 18,
    textAlign: 'right',
  },
  voteCountSelected: {
    color: COLORS.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  emptyLogo: {
    width: 44,
    height: 44,
    opacity: 0.6,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
