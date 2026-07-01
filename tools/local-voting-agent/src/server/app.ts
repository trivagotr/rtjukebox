import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { normalizeCandidateCount } from '../agent/config';
import { selectRandomCandidates } from '../agent/candidateSelection';
import type { BackendVotingClient } from '../agent/backendClient';
import { buildWinnerPlaybackPlan } from '../agent/playbackPlan';
import {
  createVotingRound,
  getWinnerAttribution,
  lockRound,
  resolveRound,
  submitVote,
} from '../agent/roundEngine';
import type { CandidateCount, CatalogSong, JingleTrack, PlaybackMode, PlaybackPlan, VotingRound } from '../agent/types';

export interface CreateAppOptions {
  songs: CatalogSong[];
  jingles?: JingleTrack[];
  candidateCount?: CandidateCount;
  playbackMode?: PlaybackMode;
  jingleBeforeWinner?: boolean;
  backendClient?: BackendVotingClient | null;
  rng?: () => number;
}

interface ApiState {
  candidateCount: CandidateCount;
  round: VotingRound | null;
  attribution: string | null;
  playbackCommandPreview: string[] | null;
  playbackPlanPreview: PlaybackPlan | null;
  backendSyncError: string | null;
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
  let playbackPlanPreview: PlaybackPlan | null = null;
  let backendSyncError: string | null = null;

  async function publishRound() {
    if (!currentRound || !options.backendClient) {
      return;
    }

    try {
      await options.backendClient.publishRound(currentRound);
      backendSyncError = null;
    } catch (error) {
      backendSyncError = error instanceof Error ? error.message : 'backend_sync_failed';
    }
  }

  function state(): ApiState {
    return {
      candidateCount,
      round: currentRound,
      attribution: currentRound ? getWinnerAttribution(currentRound) : null,
      playbackCommandPreview,
      playbackPlanPreview,
      backendSyncError,
    };
  }

  app.use(cors());
  app.use(express.json());

  app.get('/api/state', (_req, res) => {
    res.json(state());
  });

  app.get('/album-art/:songId', (req, res) => {
    const song = options.songs.find((catalogSong) => catalogSong.id === req.params.songId);
    if (!song?.albumArtPath || !existsSync(song.albumArtPath)) {
      res.status(404).json({ error: 'album_art_not_found' });
      return;
    }

    res.sendFile(song.albumArtPath);
  });

  app.post('/api/rounds/start', async (req, res) => {
    candidateCount = normalizeCandidateCount(req.body?.candidateCount ?? candidateCount);
    const candidates = selectRandomCandidates(options.songs, candidateCount, rng);
    currentRound = createVotingRound(candidates);
    playbackCommandPreview = null;
    playbackPlanPreview = null;
    await publishRound();

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

  app.post('/api/rounds/:roundId/resolve', async (req, res) => {
    if (!isActiveRound(currentRound, req.params.roundId)) {
      res.status(404).json({ error: 'round_not_found' });
      return;
    }

    currentRound = resolveRound(currentRound, rng);
    const winner = currentRound.candidates.find((candidate) => candidate.id === currentRound?.winnerCandidateId);
    playbackPlanPreview = winner
      ? buildWinnerPlaybackPlan({
          winner,
          jingles: options.jingles ?? [],
          playbackMode: options.playbackMode ?? 'dry-run',
          jingleBeforeWinner: Boolean(options.jingleBeforeWinner),
          rng,
        })
      : null;
    playbackCommandPreview = playbackPlanPreview?.entries.find((entry) => entry.kind === 'winner')?.ffmpegArgs ?? null;
    await publishRound();

    res.json(state());
  });

  return app;
}
