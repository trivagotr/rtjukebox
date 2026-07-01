import type { RoundResolutionMode, VoteRecord, VotingCandidate, VotingRound } from './types';

export interface VoteInput {
  userId: string;
  candidateId: string;
  now?: Date;
}

export interface VoteResult {
  round: VotingRound;
  accepted: boolean;
  rewardKey?: string;
  reason?: 'round_not_open' | 'candidate_not_found';
}

function roundIdFromDate(now: Date): string {
  return `round-${now.toISOString().replaceAll(':', '-').replace('.', '-')}`;
}

function cloneCandidates(candidates: VotingCandidate[]): VotingCandidate[] {
  return candidates.map((candidate) => ({ ...candidate, votes: 0 }));
}

function withVoteCounts(round: VotingRound): VotingRound {
  const counts = new Map<string, number>();
  for (const vote of round.votes) {
    counts.set(vote.candidateId, (counts.get(vote.candidateId) ?? 0) + 1);
  }

  return {
    ...round,
    candidates: round.candidates.map((candidate) => ({
      ...candidate,
      votes: counts.get(candidate.id) ?? 0,
    })),
  };
}

function rewardKeyFor(roundId: string, userId: string): string {
  return `${roundId}:${userId}:voting_reward`;
}

export function createVotingRound(candidates: VotingCandidate[], now: Date = new Date()): VotingRound {
  return {
    id: roundIdFromDate(now),
    status: 'open',
    openedAt: now.toISOString(),
    lockedAt: null,
    resolvedAt: null,
    candidates: cloneCandidates(candidates),
    votes: [],
    winnerCandidateId: null,
    resolutionMode: null,
  };
}

export function submitVote(round: VotingRound, input: VoteInput): VoteResult {
  if (round.status !== 'open') {
    return { round, accepted: false, reason: 'round_not_open' };
  }

  if (!round.candidates.some((candidate) => candidate.id === input.candidateId)) {
    return { round, accepted: false, reason: 'candidate_not_found' };
  }

  const acceptedAt = (input.now ?? new Date()).toISOString();
  const existingVote = round.votes.find((vote) => vote.userId === input.userId);
  const nextVote: VoteRecord = {
    userId: input.userId,
    candidateId: input.candidateId,
    acceptedAt,
    rewardKey: existingVote?.rewardKey ?? rewardKeyFor(round.id, input.userId),
  };

  const votes = existingVote
    ? round.votes.map((vote) => (vote.userId === input.userId ? nextVote : vote))
    : [...round.votes, nextVote];

  const nextRound = withVoteCounts({ ...round, votes });

  return {
    round: nextRound,
    accepted: true,
    rewardKey: existingVote ? undefined : nextVote.rewardKey,
  };
}

export function lockRound(round: VotingRound, now: Date = new Date()): VotingRound {
  if (round.status !== 'open') {
    return round;
  }

  return {
    ...round,
    status: 'locked',
    lockedAt: now.toISOString(),
  };
}

function chooseCandidate(candidates: VotingCandidate[], rng: () => number): VotingCandidate {
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[Math.max(0, index)];
}

function getResolution(round: VotingRound, rng: () => number): {
  winnerCandidateId: string;
  resolutionMode: RoundResolutionMode;
} {
  if (round.votes.length === 0) {
    return {
      winnerCandidateId: chooseCandidate(round.candidates, rng).id,
      resolutionMode: 'no-vote-fallback',
    };
  }

  const counted = withVoteCounts(round).candidates;
  const highestVoteCount = Math.max(...counted.map((candidate) => candidate.votes));
  const leaders = counted.filter((candidate) => candidate.votes === highestVoteCount);

  if (leaders.length === 1) {
    return {
      winnerCandidateId: leaders[0].id,
      resolutionMode: 'user-vote',
    };
  }

  return {
    winnerCandidateId: chooseCandidate(leaders, rng).id,
    resolutionMode: 'tie-break',
  };
}

export function resolveRound(round: VotingRound, rng: () => number = Math.random, now: Date = new Date()): VotingRound {
  if (round.status === 'resolved' && round.winnerCandidateId && round.resolutionMode) {
    return round;
  }

  const resolution = getResolution(round, rng);

  return withVoteCounts({
    ...round,
    status: 'resolved',
    resolvedAt: now.toISOString(),
    winnerCandidateId: resolution.winnerCandidateId,
    resolutionMode: resolution.resolutionMode,
  });
}

export function getWinnerAttribution(round: VotingRound): string | null {
  if (!round.winnerCandidateId || round.resolutionMode === 'no-vote-fallback') {
    return null;
  }

  const voters = round.votes.filter((vote) => vote.candidateId === round.winnerCandidateId);
  if (voters.length === 0) {
    return null;
  }

  if (voters.length === 1) {
    return `Selected by ${voters[0].userId}`;
  }

  return `Selected by ${voters[0].userId} and ${voters.length - 1} more`;
}
