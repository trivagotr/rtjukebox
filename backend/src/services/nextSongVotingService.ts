import {randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';

import {db} from '../db';
import {getIO} from '../socket';
import {
  getVotingFallbackCoverUrl,
  removeStoredVotingCover,
  storeVotingCoverAsset,
  type StoredVotingCover,
} from './votingCoverArt';

export const votingRoundStatusSchema = z.enum(['open', 'locked', 'resolved', 'cancelled']);

const DEFAULT_VOTING_STREAM_URL = 'https://stream.radiotedu.com/ai';

export function resolveVotingStreamUrl(value = process.env.VOTING_STREAM_URL): string {
  if (!value?.trim()) return DEFAULT_VOTING_STREAM_URL;
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol === 'https:'
      && parsed.hostname === 'stream.radiotedu.com'
      && parsed.port === ''
      && parsed.pathname === '/ai'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === ''
    ) {
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // Fall back to the fixed public listener URL below.
  }
  return DEFAULT_VOTING_STREAM_URL;
}

const albumArtAssetSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(4).max(2_100_000),
}).strict();

const votingCandidateSchema = z.object({
  id: z.string().trim().min(1).max(120),
  songId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(255),
  artist: z.string().trim().min(1).max(255),
  albumArtUrl: z.string().trim().max(2000).nullable().optional(),
  albumArtAsset: albumArtAssetSchema.nullable().optional(),
  votes: z.number().int().nonnegative().optional(),
}).strict();

export const votingRoundPublishSchema = z.object({
  id: z.string().trim().min(1).max(120),
  status: votingRoundStatusSchema,
  openedAt: z.string().datetime(),
  lockAt: z.string().datetime(),
  resolveAt: z.string().datetime(),
  lockedAt: z.string().datetime().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  candidates: z.array(votingCandidateSchema).length(3),
  winnerCandidateId: z.string().trim().min(1).max(120).nullable().optional(),
  resolutionMode: z.enum(['user-vote', 'tie-break', 'no-vote-fallback']).nullable().optional(),
}).strict().superRefine((round, context) => {
  const candidateIds = new Set(round.candidates.map((candidate) => candidate.id));
  const songIds = new Set(round.candidates.map((candidate) => candidate.songId));
  if (candidateIds.size !== round.candidates.length || songIds.size !== round.candidates.length) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'candidate_ids_and_songs_must_be_unique'});
  }

  const openedAt = Date.parse(round.openedAt);
  const lockAt = Date.parse(round.lockAt);
  const resolveAt = Date.parse(round.resolveAt);
  if (lockAt < openedAt) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['lockAt'], message: 'lock_before_open'});
  }
  if (resolveAt < lockAt) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['resolveAt'], message: 'resolve_before_lock'});
  }
});

export const votingResolveSchema = z.object({
  roundId: z.string().trim().min(1).max(120),
}).strict();

export type VotingRoundPublishInput = z.infer<typeof votingRoundPublishSchema>;

export interface NormalizedVotingCandidate {
  id: string;
  songId: string;
  title: string;
  artist: string;
  albumArtUrl: string;
  votes: number;
}

export interface NormalizedVotingRound {
  id: string;
  status: z.infer<typeof votingRoundStatusSchema>;
  openedAt: string;
  lockAt: string | null;
  resolveAt: string | null;
  lockedAt: string | null;
  resolvedAt: string | null;
  serverNow: string;
  candidates: NormalizedVotingCandidate[];
  userVoteCandidateId: string | null;
  winnerCandidateId: string | null;
  resolutionMode: 'user-vote' | 'tie-break' | 'no-vote-fallback' | null;
}

export interface RadioAgentPublicStatus {
  agentId: string | null;
  connected: boolean;
  lastSeen: string | null;
}

type QueryResultLike = {rows: Array<Record<string, any>>};
type Queryable = {query(text: string, values?: unknown[]): Promise<QueryResultLike>};
type Connectable = {connect(): Promise<PoolClient>};

export class VotingServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(code);
    this.name = 'VotingServiceError';
  }
}

let radioAgentStatusProvider: () => RadioAgentPublicStatus = () => ({
  agentId: null,
  connected: false,
  lastSeen: null,
});

export function setRadioAgentStatusProvider(provider: () => RadioAgentPublicStatus) {
  radioAgentStatusProvider = provider;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function transitionEvent(previousStatus: string | null, nextStatus: string) {
  if (nextStatus === 'cancelled') return 'next_vote_round_cancelled';
  if (nextStatus === 'resolved') return 'next_vote_round_resolved';
  if (nextStatus === 'locked' && previousStatus !== 'locked') return 'next_vote_round_locked';
  if (!previousStatus && nextStatus === 'open') return 'next_vote_round_started';
  return 'next_vote_round_updated';
}

function isPermittedTransition(previousStatus: string, nextStatus: string) {
  const transitions: Record<string, Set<string>> = {
    open: new Set(['open', 'locked', 'cancelled']),
    locked: new Set(['locked', 'cancelled']),
    resolved: new Set(['resolved']),
    cancelled: new Set(['cancelled']),
  };
  return transitions[previousStatus]?.has(nextStatus) ?? false;
}

interface ServiceDependencies {
  query?: Queryable['query'];
  pool?: Connectable;
  emit?: (event: string, round: NormalizedVotingRound) => void;
  chooseIndex?: (upperExclusive: number) => number;
}

export function createNextSongVotingService(dependencies: ServiceDependencies = {}) {
  const query = dependencies.query ?? db.query;
  const pool = dependencies.pool ?? db.pool;
  const emit = dependencies.emit ?? ((event, round) => getIO()?.emit(event, round));
  const chooseIndex = dependencies.chooseIndex ?? ((upperExclusive) => randomInt(upperExclusive));

  async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function loadRound(
    roundId: string,
    userId: string | null = null,
    executor: Queryable = {query},
  ): Promise<NormalizedVotingRound | null> {
    const roundResult = await executor.query(
      `SELECT id, status, opened_at, lock_at, resolve_at, locked_at, resolved_at,
              winner_candidate_id, resolution_mode, NOW() AS server_now
       FROM next_song_vote_rounds
       WHERE id = $1`,
      [roundId],
    );
    const row = roundResult.rows[0];
    if (!row) return null;

    const candidatesResult = await executor.query(
      `SELECT c.candidate_id, c.song_id, c.title, c.artist,
              COALESCE(c.album_art_url, $2) AS album_art_url,
              COUNT(b.user_id)::int AS votes
       FROM next_song_vote_candidates c
       LEFT JOIN next_song_vote_ballots b
         ON b.round_id = c.round_id AND b.candidate_id = c.candidate_id
       WHERE c.round_id = $1
       GROUP BY c.round_id, c.candidate_id, c.song_id, c.title, c.artist, c.album_art_url
       ORDER BY c.candidate_id`,
      [roundId, getVotingFallbackCoverUrl()],
    );
    const voteResult = userId
      ? await executor.query(
        'SELECT candidate_id FROM next_song_vote_ballots WHERE round_id = $1 AND user_id = $2',
        [roundId, userId],
      )
      : {rows: []};

    return {
      id: String(row.id),
      status: votingRoundStatusSchema.parse(row.status),
      openedAt: toIso(row.opened_at) ?? new Date(0).toISOString(),
      lockAt: toIso(row.lock_at),
      resolveAt: toIso(row.resolve_at),
      lockedAt: toIso(row.locked_at),
      resolvedAt: toIso(row.resolved_at),
      serverNow: toIso(row.server_now) ?? new Date().toISOString(),
      candidates: candidatesResult.rows.map((candidate) => ({
        id: String(candidate.candidate_id),
        songId: String(candidate.song_id),
        title: String(candidate.title),
        artist: String(candidate.artist),
        albumArtUrl: String(candidate.album_art_url || getVotingFallbackCoverUrl()),
        votes: Number(candidate.votes ?? 0),
      })),
      userVoteCandidateId: voteResult.rows[0]?.candidate_id ? String(voteResult.rows[0].candidate_id) : null,
      winnerCandidateId: row.winner_candidate_id ? String(row.winner_candidate_id) : null,
      resolutionMode: row.resolution_mode ?? null,
    };
  }

  async function emitCurrentRound(event: string, roundId: string) {
    const round = await loadRound(roundId);
    if (round) emit(event, round);
    return round;
  }

  async function advanceExpiredLocks() {
    const result = await query(
      `UPDATE next_song_vote_rounds
       SET status = 'locked', locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
       WHERE status = 'open' AND lock_at IS NOT NULL AND NOW() >= lock_at
       RETURNING id`,
    );
    for (const row of result.rows) {
      await emitCurrentRound('next_vote_round_locked', String(row.id));
    }
  }

  async function getActiveRound(userId: string | null = null, agentId: string | null = null) {
    await advanceExpiredLocks();
    const params: unknown[] = [];
    let agentFilter = '';
    if (agentId) {
      params.push(agentId);
      agentFilter = `AND source_device_id = $${params.length}`;
    }
    const result = await query(
      `SELECT id FROM next_song_vote_rounds
       WHERE status IN ('open', 'locked') ${agentFilter}
       ORDER BY opened_at DESC, updated_at DESC LIMIT 1`,
      params,
    );
    return result.rows[0] ? loadRound(String(result.rows[0].id), userId) : null;
  }

  async function getAgentRecoveryRound(agentId: string) {
    const active = await getActiveRound(null, agentId);
    if (active) return active;

    const configuredGrace = Number.parseInt(
      process.env.RADIO_AGENT_RESOLVED_RECOVERY_GRACE_SECONDS ?? '300',
      10,
    );
    const recoveryGraceSeconds = Number.isSafeInteger(configuredGrace)
      ? Math.min(1_800, Math.max(30, configuredGrace))
      : 300;
    const result = await query(
      `SELECT id FROM next_song_vote_rounds
       WHERE source_device_id = $1
         AND status = 'resolved'
         AND resolved_at >= NOW() - ($2::int * INTERVAL '1 second')
       ORDER BY resolved_at DESC, updated_at DESC LIMIT 1`,
      [agentId, recoveryGraceSeconds],
    );
    return result.rows[0] ? loadRound(String(result.rows[0].id)) : null;
  }

  async function prepareCandidates(round: VotingRoundPublishInput) {
    const storedCovers: StoredVotingCover[] = [];
    const candidates = [];
    try {
      for (const candidate of round.candidates) {
        let storedCover: StoredVotingCover | null = null;
        if (candidate.albumArtAsset) {
          storedCover = await storeVotingCoverAsset(candidate.albumArtAsset);
          storedCovers.push(storedCover);
        }
        // Agent-supplied absolute URLs are never persisted. A cover is either a
        // backend-reencoded relative asset or the same-origin RadioTEDU fallback.
        candidates.push({
          ...candidate,
          storedCover,
          coverUrl: storedCover?.publicUrl ?? getVotingFallbackCoverUrl(),
          coverHash: storedCover?.contentHash ?? null,
          coverProvided: Boolean(storedCover),
        });
      }
      return {candidates, storedCovers};
    } catch (error) {
      await Promise.allSettled(storedCovers.map((cover) => removeStoredVotingCover(cover.absolutePath)));
      if (error instanceof VotingServiceError) throw error;
      throw new VotingServiceError('invalid_cover_asset', 400);
    }
  }

  async function publishRound(rawRound: unknown, agentId: string) {
    let round: VotingRoundPublishInput;
    try {
      round = votingRoundPublishSchema.parse(rawRound);
    } catch {
      throw new VotingServiceError('invalid_round_payload', 400);
    }
    if (round.status === 'resolved') {
      throw new VotingServiceError('use_round_resolve', 409);
    }

    const prepared = await prepareCandidates(round);
    const staleRoundIds: string[] = [];
    const coversToDeleteAfterCommit: string[] = [];
    let previousStatus: string | null = null;
    try {
      await withTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('radiotedu_next_song_voting_active_round'))");
        const nowResult = await client.query('SELECT NOW() AS server_now');
        const serverNow = new Date(nowResult.rows[0].server_now);
        const existingResult = await client.query(
          `SELECT id, status, source_device_id, opened_at, lock_at, resolve_at
           FROM next_song_vote_rounds WHERE id = $1 FOR UPDATE`,
          [round.id],
        );
        const existing = existingResult.rows[0];
        previousStatus = existing?.status ?? null;

        if (existing && String(existing.source_device_id) !== agentId) {
          throw new VotingServiceError('round_agent_mismatch', 403);
        }
        if (existing && !isPermittedTransition(String(existing.status), round.status)) {
          throw new VotingServiceError('round_state_regression', 409);
        }
        if (!existing && round.status !== 'open') {
          throw new VotingServiceError('round_must_start_open', 409);
        }

        const sameInstant = (left: unknown, right: string) =>
          new Date(left as string | number | Date).getTime() === new Date(right).getTime();
        if (existing && !sameInstant(existing.opened_at, round.openedAt)) {
          throw new VotingServiceError('round_schedule_immutable', 409);
        }
        if (existing?.lock_at && round.lockAt && !sameInstant(existing.lock_at, round.lockAt)) {
          throw new VotingServiceError('round_schedule_immutable', 409);
        }
        if (existing?.resolve_at && round.resolveAt && !sameInstant(existing.resolve_at, round.resolveAt)) {
          throw new VotingServiceError('round_schedule_immutable', 409);
        }

        const effectiveLockAt = existing?.lock_at ?? round.lockAt ?? null;
        if (round.status === 'locked' && !effectiveLockAt) {
          throw new VotingServiceError('round_schedule_missing', 409);
        }
        if (round.status === 'locked' && serverNow < new Date(effectiveLockAt)) {
          throw new VotingServiceError('round_lock_too_early', 409);
        }

        if (round.status === 'open' || round.status === 'locked') {
          const activeResult = await client.query(
            `SELECT id, resolve_at FROM next_song_vote_rounds
             WHERE status IN ('open', 'locked') AND id <> $1
             ORDER BY opened_at DESC FOR UPDATE`,
            [round.id],
          );
          for (const active of activeResult.rows) {
            const resolveAt = toIso(active.resolve_at);
            if (!resolveAt || new Date(resolveAt) > serverNow) {
              throw new VotingServiceError('active_round_exists', 409);
            }
            await client.query(
              `UPDATE next_song_vote_rounds
               SET status = 'cancelled', updated_at = NOW()
               WHERE id = $1 AND status IN ('open', 'locked')`,
              [active.id],
            );
            staleRoundIds.push(String(active.id));
          }
        }

        const existingCandidates = existing
          ? await client.query(
            `SELECT candidate_id, song_id, album_art_url, album_art_sha256
             FROM next_song_vote_candidates
             WHERE round_id = $1 ORDER BY candidate_id`,
            [round.id],
          )
          : {rows: []};
        if (existingCandidates.rows.length > 0) {
          const before = existingCandidates.rows.map((row) => `${row.candidate_id}:${row.song_id}`).sort();
          const after = prepared.candidates.map((candidate) => `${candidate.id}:${candidate.songId}`).sort();
          if (before.length !== after.length || before.some((value, index) => value !== after[index])) {
            throw new VotingServiceError('round_candidates_immutable', 409);
          }

          const existingById = new Map(existingCandidates.rows.map((candidate) => [String(candidate.candidate_id), candidate]));
          for (const candidate of prepared.candidates) {
            const existingCandidate = existingById.get(candidate.id);
            if (!candidate.storedCover || !existingCandidate) continue;
            if (existingCandidate.album_art_sha256 === candidate.coverHash) {
              coversToDeleteAfterCommit.push(candidate.storedCover.absolutePath);
              candidate.coverUrl = String(existingCandidate.album_art_url || getVotingFallbackCoverUrl());
              candidate.coverHash = existingCandidate.album_art_sha256 ?? null;
              candidate.coverProvided = false;
            } else if (typeof existingCandidate.album_art_url === 'string' &&
                       existingCandidate.album_art_url.startsWith('/uploads/next-song-voting/')) {
              coversToDeleteAfterCommit.push(existingCandidate.album_art_url);
            }
          }
        }

        await client.query(
          `INSERT INTO next_song_vote_rounds
             (id, status, opened_at, lock_at, resolve_at, locked_at, resolved_at,
              winner_candidate_id, resolution_mode, source_device_id)
           VALUES ($1, $2::varchar, $3, $4, $5,
                   CASE WHEN $2::text = 'locked' THEN NOW() ELSE NULL END,
                   NULL, NULL, NULL, $6)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             lock_at = COALESCE(next_song_vote_rounds.lock_at, EXCLUDED.lock_at),
             resolve_at = COALESCE(next_song_vote_rounds.resolve_at, EXCLUDED.resolve_at),
             locked_at = CASE
               WHEN EXCLUDED.status = 'locked' THEN COALESCE(next_song_vote_rounds.locked_at, NOW())
               ELSE next_song_vote_rounds.locked_at
             END,
             updated_at = NOW()`,
          [round.id, round.status, round.openedAt, round.lockAt ?? null, round.resolveAt ?? null, agentId],
        );

        for (const candidate of prepared.candidates) {
          await client.query(
            `INSERT INTO next_song_vote_candidates
               (round_id, candidate_id, song_id, title, artist, album_art_url, album_art_sha256)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (round_id, candidate_id) DO UPDATE SET
               title = EXCLUDED.title,
               artist = EXCLUDED.artist,
               album_art_url = CASE WHEN $8::boolean
                 THEN EXCLUDED.album_art_url
                 ELSE next_song_vote_candidates.album_art_url
               END,
               album_art_sha256 = CASE WHEN $8::boolean
                 THEN EXCLUDED.album_art_sha256
                 ELSE next_song_vote_candidates.album_art_sha256
               END`,
            [
              round.id,
              candidate.id,
              candidate.songId,
              candidate.title,
              candidate.artist,
              candidate.coverUrl,
              candidate.coverHash,
              candidate.coverProvided,
            ],
          );
        }
      });
    } catch (error) {
      await Promise.allSettled(prepared.storedCovers.map((cover) => removeStoredVotingCover(cover.absolutePath)));
      throw error;
    }

    for (const staleRoundId of staleRoundIds) {
      await emitCurrentRound('next_vote_round_cancelled', staleRoundId);
    }
    const cleanupResults = await Promise.allSettled(
      coversToDeleteAfterCommit.map((cover) => removeStoredVotingCover(cover)),
    );
    const cleanupFailures = cleanupResults.filter((result) => result.status === 'rejected').length;
    if (cleanupFailures > 0) {
      console.warn(JSON.stringify({
        component: 'next_song_voting',
        event: 'cover_cleanup_failed',
        count: cleanupFailures,
      }));
    }
    const result = await loadRound(round.id);
    if (!result) throw new VotingServiceError('round_persist_failed', 500);
    emit(transitionEvent(previousStatus, result.status), result);
    return result;
  }

  async function castVote(roundId: string, candidateId: string, userId: string) {
    let lockedByClock = false;
    try {
      await withTransaction(async (client) => {
        const userResult = await client.query('SELECT is_guest FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (!userResult.rows[0] || userResult.rows[0].is_guest) {
          throw new VotingServiceError('registered_account_required', 403);
        }

        const roundResult = await client.query(
          `SELECT id, status, lock_at, NOW() AS server_now
           FROM next_song_vote_rounds WHERE id = $1 FOR UPDATE`,
          [roundId],
        );
        const round = roundResult.rows[0];
        if (!round) throw new VotingServiceError('round_not_found', 404);
        if (round.status !== 'open') throw new VotingServiceError('round_not_open', 409);
        if (round.lock_at && new Date(round.server_now) >= new Date(round.lock_at)) {
          await client.query(
            `UPDATE next_song_vote_rounds
             SET status = 'locked', locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
             WHERE id = $1`,
            [roundId],
          );
          lockedByClock = true;
          return;
        }

        const candidateResult = await client.query(
          `SELECT candidate_id FROM next_song_vote_candidates
           WHERE round_id = $1 AND candidate_id = $2`,
          [roundId, candidateId],
        );
        if (!candidateResult.rows[0]) throw new VotingServiceError('candidate_not_in_round', 409);

        await client.query(
          `INSERT INTO next_song_vote_ballots (round_id, user_id, candidate_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (round_id, user_id) DO UPDATE SET
             candidate_id = EXCLUDED.candidate_id,
             updated_at = NOW()`,
          [roundId, userId, candidateId],
        );
      });
    } catch (error) {
      throw error;
    }

    if (lockedByClock) {
      await emitCurrentRound('next_vote_round_locked', roundId);
      throw new VotingServiceError('round_not_open', 409);
    }
    const result = await loadRound(roundId, userId);
    if (!result) throw new VotingServiceError('round_not_found', 404);
    emit('next_vote_round_updated', {...result, userVoteCandidateId: null});
    return result;
  }

  async function resolveRound(roundId: string, agentId: string) {
    let alreadyResolved = false;
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('radiotedu_next_song_voting_active_round'))");
      const roundResult = await client.query(
        `SELECT id, status, source_device_id, resolve_at, winner_candidate_id, resolution_mode,
                NOW() AS server_now
         FROM next_song_vote_rounds WHERE id = $1 FOR UPDATE`,
        [roundId],
      );
      const round = roundResult.rows[0];
      if (!round) throw new VotingServiceError('round_not_found', 404);
      if (String(round.source_device_id) !== agentId) throw new VotingServiceError('round_agent_mismatch', 403);
      if (round.status === 'resolved') {
        alreadyResolved = true;
        return;
      }
      if (round.status === 'cancelled') throw new VotingServiceError('round_cancelled', 409);
      if (round.resolve_at && new Date(round.server_now) < new Date(round.resolve_at)) {
        throw new VotingServiceError('round_resolve_too_early', 409);
      }

      const candidatesResult = await client.query(
        `SELECT c.candidate_id, COUNT(b.user_id)::int AS votes
         FROM next_song_vote_candidates c
         LEFT JOIN next_song_vote_ballots b
           ON b.round_id = c.round_id AND b.candidate_id = c.candidate_id
         WHERE c.round_id = $1
         GROUP BY c.candidate_id
         ORDER BY c.candidate_id`,
        [roundId],
      );
      if (candidatesResult.rows.length < 2) throw new VotingServiceError('round_candidates_missing', 409);

      const counts = candidatesResult.rows.map((candidate) => ({
        id: String(candidate.candidate_id),
        votes: Number(candidate.votes ?? 0),
      }));
      const maxVotes = Math.max(...counts.map((candidate) => candidate.votes));
      const eligible = maxVotes > 0
        ? counts.filter((candidate) => candidate.votes === maxVotes)
        : counts;
      const winner = eligible[chooseIndex(eligible.length)];
      const resolutionMode = maxVotes === 0
        ? 'no-vote-fallback'
        : eligible.length > 1
          ? 'tie-break'
          : 'user-vote';

      await client.query(
        `UPDATE next_song_vote_rounds
         SET status = 'resolved',
             locked_at = COALESCE(locked_at, NOW()),
             resolved_at = NOW(),
             winner_candidate_id = $2,
             resolution_mode = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [roundId, winner.id, resolutionMode],
      );
    });

    const result = await loadRound(roundId);
    if (!result) throw new VotingServiceError('round_not_found', 404);
    if (!alreadyResolved) emit('next_vote_round_resolved', result);
    return result;
  }

  async function handleAgentRequest(agentId: string, method: string, payload: unknown) {
    if (method === 'round.publish') {
      return {round: await publishRound(payload, agentId)};
    }
    if (method === 'round.active') {
      return {round: await getAgentRecoveryRound(agentId)};
    }
    if (method === 'round.resolve') {
      let parsed: z.infer<typeof votingResolveSchema>;
      try {
        parsed = votingResolveSchema.parse(payload);
      } catch {
        throw new VotingServiceError('invalid_resolve_payload', 400);
      }
      return {round: await resolveRound(parsed.roundId, agentId)};
    }
    throw new VotingServiceError('unsupported_agent_method', 400);
  }

  async function getStatus() {
    const activeRound = await getActiveRound();
    const agent = radioAgentStatusProvider();
    return {
      agent,
      activeRound: activeRound
        ? {
          id: activeRound.id,
          status: activeRound.status,
          openedAt: activeRound.openedAt,
          lockAt: activeRound.lockAt,
          resolveAt: activeRound.resolveAt,
        }
        : null,
      streamUrl: resolveVotingStreamUrl(),
      serverNow: new Date().toISOString(),
    };
  }

  return {
    publishRound,
    getActiveRound,
    getAgentRecoveryRound,
    loadRound,
    castVote,
    resolveRound,
    handleAgentRequest,
    getStatus,
    advanceExpiredLocks,
  };
}

export const nextSongVotingService = createNextSongVotingService();
