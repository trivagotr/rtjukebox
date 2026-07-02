import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import io from 'socket.io-client';
import {API_ORIGIN} from '../../services/api';
import {
  fetchActiveNextSongVoteRound,
  formatNextSongVoteRemainingTime,
  getCandidateArtworkUrl,
  getNextSongVoteErrorCopy,
  getNextSongVoteStatusCopy,
  getWinningCandidate,
  normalizeNextSongVoteRound,
  submitNextSongVote,
  type NextSongVoteCandidate,
  type NextSongVoteRound,
} from '../../services/nextSongVote';
import {COLORS, SPACING} from '../../theme/theme';

const fallbackArt = require('../../assets/images/logo-03byz.png');
const POLLING_INTERVAL_MS = 4000;

function CandidateCard({
  candidate,
  disabled,
  isSelected,
  isWinner,
  onVote,
}: {
  candidate: NextSongVoteCandidate;
  disabled: boolean;
  isSelected: boolean;
  isWinner: boolean;
  onVote: () => void;
}) {
  const artworkUrl = getCandidateArtworkUrl(candidate);

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={onVote}
      style={[
        styles.candidateCard,
        isSelected && styles.candidateCardSelected,
        isWinner && styles.candidateCardWinner,
        disabled && styles.candidateCardDisabled,
      ]}>
      <Image
        source={artworkUrl ? {uri: artworkUrl} : fallbackArt}
        style={styles.artwork}
      />
      <View style={styles.candidateText}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {candidate.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {candidate.artist}
        </Text>
      </View>
      <View style={styles.votePill}>
        <Icon
          name={
            isWinner ? 'trophy' : isSelected ? 'check-circle' : 'vote-outline'
          }
          size={17}
          color={
            isWinner
              ? COLORS.success
              : isSelected
              ? COLORS.primary
              : COLORS.textMuted
          }
        />
        <Text
          style={[
            styles.voteCount,
            (isSelected || isWinner) && styles.voteCountActive,
          ]}>
          {candidate.voteCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NextSongVoteScreen() {
  const [round, setRound] = useState<NextSongVoteRound | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [votingCandidateId, setVotingCandidateId] = useState<string | null>(
    null,
  );

  const loadRound = useCallback(async () => {
    try {
      const nextRound = await fetchActiveNextSongVoteRound();
      setRound(nextRound);
    } catch (error) {
      console.error('Failed to load next-song voting round:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRound();
    const interval = setInterval(loadRound, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadRound]);

  useEffect(() => {
    const socket = io(API_ORIGIN, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnectionAttempts: 5,
    });

    const updateRound = (payload: unknown) => {
      setRound(normalizeNextSongVoteRound(payload));
      setIsLoading(false);
    };

    socket.on('next_vote_round_started', updateRound);
    socket.on('next_vote_round_updated', updateRound);
    socket.on('next_vote_round_locked', updateRound);
    socket.on('next_vote_round_resolved', updateRound);
    socket.on('next_vote_round_cancelled', () => setRound(null));

    return () => {
      socket.disconnect();
    };
  }, []);

  const winner = useMemo(() => getWinningCandidate(round), [round]);
  const remainingTime = useMemo(
    () => formatNextSongVoteRemainingTime(round),
    [round],
  );
  const selectedVoteCandidateId =
    round?.userVoteCandidateId ?? selectedCandidateId;
  const canVote = round?.status === 'active' && !votingCandidateId;

  useEffect(() => {
    if (!round) {
      setSelectedCandidateId(null);
      return;
    }

    if (round.userVoteCandidateId) {
      setSelectedCandidateId(round.userVoteCandidateId);
    }
  }, [round]);

  const handleVote = async (candidateId: string) => {
    if (!round || round.status !== 'active') {
      return;
    }

    try {
      setVotingCandidateId(candidateId);
      setSelectedCandidateId(candidateId);
      const nextRound = await submitNextSongVote(round.id, candidateId);
      if (nextRound) {
        setRound(nextRound);
      }
    } catch (error) {
      Alert.alert('Hata', getNextSongVoteErrorCopy(error));
    } finally {
      setVotingCandidateId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Icon name="vote" size={24} color={COLORS.primary} />
            <Text style={styles.title}>Sıradaki Şarkı</Text>
          </View>
          <Text style={styles.subtitle}>
            Yayın akışında çalacak parçayı oyla.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.status}>{getNextSongVoteStatusCopy(round)}</Text>
          {round && (
            <View style={styles.metaStack}>
              {round.stationName && (
                <Text style={styles.stationName}>{round.stationName}</Text>
              )}
              <Text style={styles.meta}>
                {round.status === 'resolved' && winner
                  ? `${winner.title} kazandı`
                  : `${round.voteCount} oy`}
              </Text>
              {remainingTime && (
                <Text style={styles.remainingTime}>{remainingTime} kaldı</Text>
              )}
            </View>
          )}

          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={styles.loader} />
          ) : round?.candidates.length ? (
            <View style={styles.candidateList}>
              {round.candidates.map(candidate => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  disabled={!canVote}
                  isSelected={selectedVoteCandidateId === candidate.id}
                  isWinner={round.winningCandidateId === candidate.id}
                  onVote={() => handleVote(candidate.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Image source={fallbackArt} style={styles.emptyLogo} />
              <Text style={styles.emptyText}>
                Yeni oylama başladığında burada görünecek.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 96,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: SPACING.xs,
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  status: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: 'bold',
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  metaStack: {
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  stationName: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  remainingTime: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  loader: {
    paddingVertical: SPACING.lg,
  },
  candidateList: {
    marginTop: SPACING.md,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
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
  artwork: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  candidateText: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  songTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  votePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voteCount: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 4,
    minWidth: 18,
    textAlign: 'right',
  },
  voteCountActive: {
    color: COLORS.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyLogo: {
    width: 54,
    height: 54,
    opacity: 0.65,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
