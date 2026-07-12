import {Router, Request, Response} from 'express';
import {z} from 'zod';

import {db} from '../db';
import {authMiddleware, AuthRequest, optionalAuth} from '../middleware/auth';
import {sendError, sendSuccess} from '../utils/response';

const router = Router();

const roundStatusSchema = z.enum(['open', 'locked', 'resolved', 'cancelled']);
const roundSchema = z.object({
  id: z.string().trim().min(1).max(120),
  status: roundStatusSchema,
  openedAt: z.string().datetime(),
  lockedAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  candidates: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    songId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(255),
    artist: z.string().trim().min(1).max(255),
    albumArtUrl: z.string().url().max(1000).nullable(),
    votes: z.number().int().nonnegative(),
  })).min(2).max(3),
  winnerCandidateId: z.string().trim().max(120).nullable(),
  resolutionMode: z.enum(['user-vote', 'tie-break', 'no-vote-fallback']).nullable(),
});

const voteSchema = z.object({candidateId: z.string().trim().min(1).max(120)});

function hasTrustedAgentCredentials(request: Request): boolean {
  const expectedToken = process.env.NEXT_SONG_VOTING_AGENT_TOKEN?.trim();
  const expectedDeviceId = process.env.NEXT_SONG_VOTING_AGENT_DEVICE_ID?.trim();
  const header = request.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const deviceId = typeof request.headers['x-rt-device-id'] === 'string' ? request.headers['x-rt-device-id'].trim() : '';

  return Boolean(expectedToken && expectedDeviceId && token === expectedToken && deviceId === expectedDeviceId);
}

function toRound(row: Record<string, any>, candidates: Array<Record<string, any>>, userVoteCandidateId: string | null) {
  return {
    id: row.id,
    status: row.status,
    lockAt: row.locked_at ?? null,
    resolvedAt: row.resolved_at ?? null,
    winnerCandidateId: row.winner_candidate_id ?? null,
    resolutionMode: row.resolution_mode ?? null,
    userVoteCandidateId,
    candidates: candidates.map((candidate) => ({
      id: candidate.candidate_id,
      songId: candidate.song_id,
      title: candidate.title,
      artist: candidate.artist,
      albumArtUrl: candidate.album_art_url ?? null,
      votes: Number(candidate.votes ?? 0),
    })),
  };
}

router.post('/agent/rounds', async (req: Request, res: Response) => {
  if (!hasTrustedAgentCredentials(req)) {
    return sendError(res, 'Invalid voting agent credentials', 401);
  }

  try {
    const round = roundSchema.parse(req.body);
    await db.query(
      `INSERT INTO next_song_vote_rounds (id, status, opened_at, locked_at, resolved_at, winner_candidate_id, resolution_mode, source_device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         locked_at = EXCLUDED.locked_at,
         resolved_at = EXCLUDED.resolved_at,
         winner_candidate_id = EXCLUDED.winner_candidate_id,
         resolution_mode = EXCLUDED.resolution_mode,
         source_device_id = EXCLUDED.source_device_id,
         updated_at = NOW()`,
      [round.id, round.status, round.openedAt, round.lockedAt, round.resolvedAt, round.winnerCandidateId, round.resolutionMode, req.headers['x-rt-device-id']],
    );
    await db.query(
      'DELETE FROM next_song_vote_candidates WHERE round_id = $1 AND candidate_id <> ALL($2::text[])',
      [round.id, round.candidates.map((candidate) => candidate.id)],
    );
    for (const candidate of round.candidates) {
      await db.query(
        `INSERT INTO next_song_vote_candidates (round_id, candidate_id, song_id, title, artist, album_art_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (round_id, candidate_id) DO UPDATE SET
           song_id = EXCLUDED.song_id,
           title = EXCLUDED.title,
           artist = EXCLUDED.artist,
           album_art_url = EXCLUDED.album_art_url`,
        [round.id, candidate.id, candidate.songId, candidate.title, candidate.artist, candidate.albumArtUrl],
      );
    }
    return sendSuccess(res, {roundId: round.id, status: round.status}, 'Voting round published');
  } catch (error) {
    return sendError(res, 'Invalid voting round payload', 400);
  }
});

router.get('/rounds/active', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const roundResult = await db.query(
      `SELECT id, status, locked_at, resolved_at, winner_candidate_id, resolution_mode
       FROM next_song_vote_rounds WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`,
    );
    const round = roundResult.rows[0];
    if (!round) return sendSuccess(res, {round: null}, 'No active voting round');

    const candidatesResult = await db.query(
      `SELECT c.candidate_id, c.song_id, c.title, c.artist, c.album_art_url, COUNT(b.user_id)::int AS votes
       FROM next_song_vote_candidates c
       LEFT JOIN next_song_vote_ballots b ON b.round_id = c.round_id AND b.candidate_id = c.candidate_id
       WHERE c.round_id = $1
       GROUP BY c.round_id, c.candidate_id, c.song_id, c.title, c.artist, c.album_art_url
       ORDER BY c.candidate_id`,
      [round.id],
    );
    const voteResult = req.user?.id
      ? await db.query('SELECT candidate_id FROM next_song_vote_ballots WHERE round_id = $1 AND user_id = $2', [round.id, req.user.id])
      : {rows: []};
    return sendSuccess(res, {round: toRound(round, candidatesResult.rows, voteResult.rows[0]?.candidate_id ?? null)}, 'Active voting round');
  } catch (error) {
    return sendError(res, 'Could not load active voting round', 500);
  }
});

router.post('/rounds/:roundId/votes', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {candidateId} = voteSchema.parse(req.body);
    const userResult = await db.query('SELECT is_guest FROM users WHERE id = $1', [req.user?.id]);
    if (!userResult.rows[0] || userResult.rows[0].is_guest) {
      return sendError(res, 'Registered account required', 403);
    }
    const candidateResult = await db.query(
      `SELECT c.candidate_id AS id
       FROM next_song_vote_candidates c
       JOIN next_song_vote_rounds r ON r.id = c.round_id
       WHERE c.round_id = $1 AND c.candidate_id = $2 AND r.status = 'open'`,
      [req.params.roundId, candidateId],
    );
    if (!candidateResult.rows[0]) return sendError(res, 'Voting round is not open', 409);

    const ballotResult = await db.query(
      `INSERT INTO next_song_vote_ballots (round_id, user_id, candidate_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (round_id, user_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, updated_at = NOW()
       RETURNING candidate_id`,
      [req.params.roundId, req.user!.id, candidateId],
    );
    return sendSuccess(res, {roundId: req.params.roundId, candidateId: ballotResult.rows[0].candidate_id}, 'Vote recorded');
  } catch (error) {
    return sendError(res, 'Invalid vote request', 400);
  }
});

export default router;
