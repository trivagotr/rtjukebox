import { describe, expect, it } from 'vitest';
import {
  createVotingRound,
  getWinnerAttribution,
  lockRound,
  resolveRound,
  submitVote,
} from './roundEngine';
import type { VotingCandidate } from './types';

const candidates: VotingCandidate[] = [
  {
    id: 'candidate-song-1',
    songId: 'song-1',
    title: 'One',
    artist: 'Artist',
    filePath: 'C:/Music/one.mp3',
    albumArtUrl: null,
    votes: 0,
  },
  {
    id: 'candidate-song-2',
    songId: 'song-2',
    title: 'Two',
    artist: 'Artist',
    filePath: 'C:/Music/two.mp3',
    albumArtUrl: null,
    votes: 0,
  },
];

describe('round engine', () => {
  it('creates an open round with empty votes', () => {
    const round = createVotingRound(candidates, new Date('2026-07-01T10:00:00.000Z'));

    expect(round).toMatchObject({
      id: 'round-2026-07-01T10-00-00-000Z',
      status: 'open',
      candidates,
      votes: [],
      winnerCandidateId: null,
      resolutionMode: null,
    });
  });

  it('allows one active vote per user and awards only the first accepted vote', () => {
    const round = createVotingRound(candidates);
    const first = submitVote(round, { userId: 'u1', candidateId: 'candidate-song-1' });
    const second = submitVote(first.round, { userId: 'u1', candidateId: 'candidate-song-2' });

    expect(first).toMatchObject({ accepted: true, rewardKey: `${round.id}:u1:voting_reward` });
    expect(second).toMatchObject({ accepted: true, rewardKey: undefined });
    expect(second.round.votes).toHaveLength(1);
    expect(second.round.votes[0].candidateId).toBe('candidate-song-2');
    expect(second.round.candidates.map((candidate) => candidate.votes)).toEqual([0, 1]);
  });

  it('rejects unknown candidates and locked rounds', () => {
    const round = createVotingRound(candidates);
    const unknown = submitVote(round, { userId: 'u1', candidateId: 'missing' });
    const locked = submitVote(lockRound(round), { userId: 'u1', candidateId: 'candidate-song-1' });

    expect(unknown).toMatchObject({ accepted: false, reason: 'candidate_not_found' });
    expect(locked).toMatchObject({ accepted: false, reason: 'round_not_open' });
  });

  it('resolves a user-voted winner with selector attribution', () => {
    const round = createVotingRound(candidates);
    const voted = submitVote(round, { userId: 'u1', candidateId: 'candidate-song-1' }).round;
    const resolved = resolveRound(voted);

    expect(resolved.winnerCandidateId).toBe('candidate-song-1');
    expect(resolved.resolutionMode).toBe('user-vote');
    expect(getWinnerAttribution(resolved)).toBe('Selected by u1');
  });

  it('hides attribution for no-vote random fallback', () => {
    const round = createVotingRound(candidates);
    const resolved = resolveRound(round, () => 0);

    expect(resolved.winnerCandidateId).toBe('candidate-song-1');
    expect(resolved.resolutionMode).toBe('no-vote-fallback');
    expect(getWinnerAttribution(resolved)).toBeNull();
  });

  it('marks ties as tie-break resolutions', () => {
    const round = createVotingRound(candidates);
    const withFirstVote = submitVote(round, { userId: 'u1', candidateId: 'candidate-song-1' }).round;
    const tied = submitVote(withFirstVote, { userId: 'u2', candidateId: 'candidate-song-2' }).round;
    const resolved = resolveRound(tied, () => 0.99);

    expect(resolved.winnerCandidateId).toBe('candidate-song-2');
    expect(resolved.resolutionMode).toBe('tie-break');
  });
});
