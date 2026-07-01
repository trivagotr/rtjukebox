import cors from 'cors';
import express from 'express';
import { normalizeCandidateCount } from '../agent/config';
import { selectRandomCandidates } from '../agent/candidateSelection';
import { buildPlaybackArgs } from '../agent/ffmpeg';
import {
  createVotingRound,
  getWinnerAttribution,
  lockRound,
  resolveRound,
  submitVote,
} from '../agent/roundEngine';
import type { CandidateCount, CatalogSong, VotingRound } from '../agent/types';

export interface CreateAppOptions {
  songs: CatalogSong[];
  candidateCount?: CandidateCount;
  rng?: () => number;
}

interface ApiState {
  candidateCount: CandidateCount;
  round: VotingRound | null;
  attribution: string | null;
  playbackCommandPreview: string[] | null;
}

function isActiveRound(round: VotingRound | null, roundId: string): round is VotingRound {
  return Boolean(round && round.id === roundId);
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const rng = options.rng ?? Math.random;
  let candidateCount = options.candidateCount ?? 3;
  let currentRound: VotingRound | null = null;
  let playbackCommandPreview: string[] | null = null;

  function state(): ApiState {
    return {
      candidateCount,
      round: currentRound,
      attribution: currentRound ? getWinnerAttribution(currentRound) : null,
      playbackCommandPreview,
    };
  }

  app.use(cors());
  app.use(express.json());

  app.get('/api/state', (_req, res) => {
    res.json(state());
  });

  app.post('/api/rounds/start', (req, res) => {
    candidateCount = normalizeCandidateCount(req.body?.candidateCount ?? candidateCount);
    const candidates = selectRandomCandidates(options.songs, candidateCount, rng);
    currentRound = createVotingRound(candidates);
    playbackCommandPreview = null;

    res.status(201).json(state());
  });

  app.post('/api/rounds/:roundId/votes', (req, res) => {
    if (!isActiveRound(currentRound, req.params.roundId)) {
      res.status(404).json({ error: 'round_not_found' });
      return;
    }

    const result = submitVote(currentRound, {
      userId: String(req.body?.userId ?? ''),
      candidateId: String(req.body?.candidateId ?? ''),
    });
    currentRound = result.round;

    res.status(result.accepted ? 200 : 409).json({ ...state(), rewardKey: result.rewardKey, reason: result.reason });
  });

  app.post('/api/rounds/:roundId/lock', (req, res) => {
    if (!isActiveRound(currentRound, req.params.roundId)) {
      res.status(404).json({ error: 'round_not_found' });
      return;
    }

    currentRound = lockRound(currentRound);
    res.json(state());
  });

  app.post('/api/rounds/:roundId/resolve', (req, res) => {
    if (!isActiveRound(currentRound, req.params.roundId)) {
      res.status(404).json({ error: 'round_not_found' });
      return;
    }

    currentRound = resolveRound(currentRound, rng);
    const winner = currentRound.candidates.find((candidate) => candidate.id === currentRound?.winnerCandidateId);
    playbackCommandPreview = winner ? buildPlaybackArgs(winner.filePath) : null;

    res.json(state());
  });

  return app;
}
