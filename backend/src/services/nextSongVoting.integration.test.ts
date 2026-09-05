import {randomUUID} from 'node:crypto';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Pool} from 'pg';

import {createNextSongVotingService, VotingServiceError} from './nextSongVotingService';

const INTEGRATION_OPT_IN = '1';

export function isSafeVotingIntegrationTarget(databaseUrl: string | undefined, optIn: string | undefined): boolean {
  if (!databaseUrl || optIn !== INTEGRATION_OPT_IN) return false;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return false;
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return /(?:^|[_-])(?:staging|test|testing)(?:[_-]|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

const integrationDatabaseUrl = process.env.VOTING_INTEGRATION_DATABASE_URL;
const integrationEnabled = isSafeVotingIntegrationTarget(
  integrationDatabaseUrl,
  process.env.VOTING_INTEGRATION_ALLOW_STAGING_MUTATIONS,
);
const integrationDescribe = integrationEnabled ? describe : describe.skip;

describe('next-song voting PostgreSQL integration safety guard', () => {
  it('requires both an explicitly named staging/test database and an explicit opt-in', () => {
    expect(isSafeVotingIntegrationTarget(
      'postgresql://user:password@127.0.0.1/radiotedu_voting_staging_20260714',
      INTEGRATION_OPT_IN,
    )).toBe(true);
    expect(isSafeVotingIntegrationTarget(
      'postgresql://user:password@127.0.0.1/radiotedu_production',
      INTEGRATION_OPT_IN,
    )).toBe(false);
    expect(isSafeVotingIntegrationTarget(
      'postgresql://user:password@127.0.0.1/radiotedu_voting_test',
      undefined,
    )).toBe(false);
    expect(isSafeVotingIntegrationTarget('not-a-database-url', INTEGRATION_OPT_IN)).toBe(false);
  });
});

integrationDescribe('next-song voting PostgreSQL integration', () => {
  let pool: Pool;
  let service: ReturnType<typeof createNextSongVotingService>;
  const runPrefix = `voting-it-${randomUUID()}`;
  const registeredUserId = randomUUID();
  const secondUserId = randomUUID();
  const guestUserId = randomUUID();
  const emitted: string[] = [];
  const idFor = (suffix: string) => `${runPrefix}-${suffix}`;

  beforeAll(async () => {
    pool = new Pool({connectionString: integrationDatabaseUrl});
    service = createNextSongVotingService({
      query: pool.query.bind(pool),
      pool,
      chooseIndex: () => 0,
      emit: (event) => emitted.push(event),
    });
    await pool.query(
      `INSERT INTO users (id, email, display_name, is_guest) VALUES
       ($1, $2, 'Registered One', false),
       ($3, $4, 'Registered Two', false),
       ($5, $6, 'Guest', true)`,
      [
        registeredUserId,
        `voting-integration-${registeredUserId}@example.test`,
        secondUserId,
        `voting-integration-${secondUserId}@example.test`,
        guestUserId,
        `voting-integration-${guestUserId}@example.test`,
      ],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    const runPattern = `${runPrefix}-%`;
    await pool.query('DELETE FROM next_song_vote_ballots WHERE round_id LIKE $1', [runPattern]);
    await pool.query('DELETE FROM next_song_vote_candidates WHERE round_id LIKE $1', [runPattern]);
    await pool.query('DELETE FROM next_song_vote_rounds WHERE id LIKE $1', [runPattern]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[registeredUserId, secondUserId, guestUserId]]);
    await pool.end();
  });

  function roundPayload(id: string, secondsFromNow = 120) {
    const now = Date.now();
    return {
      id,
      status: 'open' as const,
      openedAt: new Date(now - 5_000).toISOString(),
      lockAt: new Date(now + secondsFromNow * 500).toISOString(),
      resolveAt: new Date(now + secondsFromNow * 1_000).toISOString(),
      lockedAt: null,
      resolvedAt: null,
      winnerCandidateId: null,
      resolutionMode: null,
      candidates: [
        {id: `${id}-a`, songId: `${id}-song-a`, title: 'A', artist: 'Artist', albumArtUrl: null, albumArtAsset: null, votes: 999},
        {id: `${id}-b`, songId: `${id}-song-b`, title: 'B', artist: 'Artist', albumArtUrl: null, albumArtAsset: null, votes: 999},
        {id: `${id}-c`, songId: `${id}-song-c`, title: 'C', artist: 'Artist', albumArtUrl: null, albumArtAsset: null, votes: 999},
      ],
    };
  }

  it('keeps publish, ballots, lock and idempotent resolution backend-authoritative', async () => {
    const roundId = idFor('round-1');
    const conflictId = idFor('round-conflict');
    const published = await service.publishRound(roundPayload(roundId), 'school-radio-pc');
    expect(published.candidates.map((candidate) => candidate.votes)).toEqual([0, 0, 0]);
    expect(emitted).toContain('next_vote_round_started');

    await expect(service.publishRound(roundPayload(conflictId), 'school-radio-pc'))
      .rejects.toMatchObject({code: 'active_round_exists'} satisfies Partial<VotingServiceError>);
    await expect(service.castVote(roundId, `${roundId}-a`, guestUserId))
      .rejects.toMatchObject({code: 'registered_account_required'} satisfies Partial<VotingServiceError>);

    await service.castVote(roundId, `${roundId}-a`, registeredUserId);
    const changed = await service.castVote(roundId, `${roundId}-b`, registeredUserId);
    expect(changed.userVoteCandidateId).toBe(`${roundId}-b`);
    const ballotCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM next_song_vote_ballots WHERE round_id = $1 AND user_id = $2',
      [roundId, registeredUserId],
    );
    expect(ballotCount.rows[0].count).toBe(1);

    await expect(pool.query(
      `INSERT INTO next_song_vote_rounds
         (id, status, opened_at, lock_at, resolve_at, source_device_id)
       VALUES ($1, 'open', NOW(), NOW() + INTERVAL '30 seconds', NOW() + INTERVAL '60 seconds', $2)`,
      [idFor('constraint-conflict'), 'school-radio-pc'],
    )).rejects.toMatchObject({code: '23505'});
    const preservedBallot = await pool.query(
      'SELECT candidate_id FROM next_song_vote_ballots WHERE round_id = $1 AND user_id = $2',
      [roundId, registeredUserId],
    );
    expect(preservedBallot.rows).toEqual([{candidate_id: `${roundId}-b`}]);

    await pool.query("UPDATE next_song_vote_rounds SET lock_at = NOW() - INTERVAL '1 second' WHERE id = $1", [roundId]);
    await expect(service.castVote(roundId, `${roundId}-a`, secondUserId))
      .rejects.toMatchObject({code: 'round_not_open'} satisfies Partial<VotingServiceError>);
    expect((await service.loadRound(roundId))?.status).toBe('locked');

    await pool.query("UPDATE next_song_vote_rounds SET resolve_at = NOW() - INTERVAL '1 second' WHERE id = $1", [roundId]);
    const resolved = await service.resolveRound(roundId, 'school-radio-pc');
    expect(resolved).toMatchObject({
      status: 'resolved',
      winnerCandidateId: `${roundId}-b`,
      resolutionMode: 'user-vote',
    });
    expect(await service.resolveRound(roundId, 'school-radio-pc')).toMatchObject({
      winnerCandidateId: `${roundId}-b`,
      resolutionMode: 'user-vote',
    });
  });

  it('uses only real ballots for crypto tie and no-vote fallback resolution', async () => {
    const tieRoundId = idFor('round-2');
    await service.publishRound(roundPayload(tieRoundId), 'school-radio-pc');
    await service.castVote(tieRoundId, `${tieRoundId}-a`, registeredUserId);
    await service.castVote(tieRoundId, `${tieRoundId}-b`, secondUserId);
    await pool.query("UPDATE next_song_vote_rounds SET resolve_at = NOW() - INTERVAL '1 second' WHERE id = $1", [tieRoundId]);
    const tie = await service.resolveRound(tieRoundId, 'school-radio-pc');
    expect(tie.resolutionMode).toBe('tie-break');
    expect([`${tieRoundId}-a`, `${tieRoundId}-b`]).toContain(tie.winnerCandidateId);

    const fallbackRoundId = idFor('round-3');
    await service.publishRound(roundPayload(fallbackRoundId), 'school-radio-pc');
    await pool.query("UPDATE next_song_vote_rounds SET resolve_at = NOW() - INTERVAL '1 second' WHERE id = $1", [fallbackRoundId]);
    const fallback = await service.resolveRound(fallbackRoundId, 'school-radio-pc');
    expect(fallback).toMatchObject({
      status: 'resolved',
      winnerCandidateId: `${fallbackRoundId}-a`,
      resolutionMode: 'no-vote-fallback',
    });
  });
});
