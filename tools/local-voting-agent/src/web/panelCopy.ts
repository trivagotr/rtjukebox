import type { VotingRound } from '../agent/types';

export function getWinnerLine(round: VotingRound | null, attribution: string | null): string {
  const winner = round?.candidates.find((candidate) => candidate.id === round.winnerCandidateId);
  if (!winner) {
    return 'Winner pending';
  }

  return attribution ? `Winner: ${winner.title} · ${attribution}` : `Winner: ${winner.title}`;
}
