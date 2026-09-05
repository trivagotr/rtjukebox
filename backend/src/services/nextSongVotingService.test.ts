import {beforeEach, describe, expect, it, vi} from 'vitest';

const coverMocks = vi.hoisted(() => ({
  remove: vi.fn(async () => undefined),
  store: vi.fn(async () => ({
    absolutePath: 'C:\\voting-covers\\cover.webp',
    publicUrl: '/jukebox/uploads/voting-covers/cover.webp',
  })),
}));

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
    pool: {connect: vi.fn()},
  },
}));

vi.mock('../socket', () => ({getIO: vi.fn(() => null)}));

vi.mock('./votingCoverArt', () => ({
  getVotingFallbackCoverUrl: () => '/jukebox/assets/voting-fallback.webp',
  removeStoredVotingCover: coverMocks.remove,
  sanitizePublicAlbumArtUrl: (value: unknown) => (
    typeof value === 'string' && /^https:\/\//.test(value) ? value : null
  ),
  storeVotingCoverAsset: coverMocks.store,
}));

import {
  createNextSongVotingService,
  resolveVotingStreamUrl,
  VotingServiceError,
  type VotingRoundPublishInput,
} from './nextSongVotingService';

type DbRow = Record<string, any>;

interface DbSnapshot {
  rounds: Array<[string, DbRow]>;
  candidates: Array<[string, Array<[string, DbRow]>]>;
  ballots: Array<[string, DbRow]>;
}

function cloneRow<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class FakeVotingDatabase {
  now = new Date('2026-07-12T10:00:00.000Z');
  users = new Map<string, {is_guest: boolean}>();
  rounds = new Map<string, DbRow>();
  candidates = new Map<string, Map<string, DbRow>>();
  ballots = new Map<string, DbRow>();
  calls: Array<{sql: string; values: unknown[]}> = [];
  transactionLog: string[] = [];
  private snapshot: DbSnapshot | null = null;

  pool = {
    connect: vi.fn(async () => ({
      query: this.query,
      release: vi.fn(),
    })),
  };

  private takeSnapshot(): DbSnapshot {
    return {
      rounds: cloneRow([...this.rounds.entries()]),
      candidates: [...this.candidates.entries()].map(([roundId, rows]) => [roundId, cloneRow([...rows.entries()])]),
      ballots: cloneRow([...this.ballots.entries()]),
    };
  }

  private restoreSnapshot(snapshot: DbSnapshot) {
    this.rounds = new Map(snapshot.rounds);
    this.candidates = new Map(snapshot.candidates.map(([roundId, rows]) => [roundId, new Map(rows)]));
    this.ballots = new Map(snapshot.ballots);
  }

  private ballotKey(roundId: string, userId: string) {
    return `${roundId}:${userId}`;
  }

  private voteCount(roundId: string, candidateId: string) {
    return [...this.ballots.values()].filter((ballot) => (
      ballot.round_id === roundId && ballot.candidate_id === candidateId
    )).length;
  }

  query = async (text: string, values: unknown[] = []): Promise<{rows: DbRow[]}> => {
    const sql = text.replace(/\s+/g, ' ').trim().toLowerCase();
    this.calls.push({sql, values});

    if (sql === 'begin') {
      this.transactionLog.push('BEGIN');
      this.snapshot = this.takeSnapshot();
      return {rows: []};
    }
    if (sql === 'commit') {
      this.transactionLog.push('COMMIT');
      this.snapshot = null;
      return {rows: []};
    }
    if (sql === 'rollback') {
      this.transactionLog.push('ROLLBACK');
      if (this.snapshot) this.restoreSnapshot(this.snapshot);
      this.snapshot = null;
      return {rows: []};
    }
    if (sql.includes('pg_advisory_xact_lock')) return {rows: [{}]};
    if (sql === 'select now() as server_now') return {rows: [{server_now: this.now.toISOString()}]};

    if (sql.startsWith('update next_song_vote_rounds set status = \'locked\'') && sql.includes('returning id')) {
      const rows: DbRow[] = [];
      for (const round of this.rounds.values()) {
        if (round.status === 'open' && round.lock_at && this.now >= new Date(round.lock_at)) {
          round.status = 'locked';
          round.locked_at ??= this.now.toISOString();
          rows.push({id: round.id});
        }
      }
      return {rows};
    }

    if (sql.startsWith('select id from next_song_vote_rounds where status in')) {
      const agentId = values.length > 0 ? String(values[0]) : null;
      const active = [...this.rounds.values()]
        .filter((round) => ['open', 'locked'].includes(round.status))
        .filter((round) => !agentId || round.source_device_id === agentId)
        .sort((left, right) => String(right.opened_at).localeCompare(String(left.opened_at)));
      return {rows: active.slice(0, 1).map((round) => ({id: round.id}))};
    }

    if (sql.startsWith('select id from next_song_vote_rounds where source_device_id = $1')) {
      const agentId = String(values[0]);
      const graceSeconds = Number(values[1]);
      const cutoff = this.now.getTime() - graceSeconds * 1000;
      const resolved = [...this.rounds.values()]
        .filter(round => round.source_device_id === agentId && round.status === 'resolved')
        .filter(round => round.resolved_at && new Date(round.resolved_at).getTime() >= cutoff)
        .sort((left, right) => String(right.resolved_at).localeCompare(String(left.resolved_at)));
      return {rows: resolved.slice(0, 1).map(round => ({id: round.id}))};
    }

    if (sql.includes('from next_song_vote_rounds') && sql.includes('where id = $1') && !sql.includes('for update')) {
      const round = this.rounds.get(String(values[0]));
      return {rows: round ? [{...cloneRow(round), server_now: this.now.toISOString()}] : []};
    }

    if (sql.includes('from next_song_vote_candidates c') && sql.includes('c.song_id')) {
      const roundId = String(values[0]);
      const fallback = String(values[1]);
      const rows = [...(this.candidates.get(roundId)?.values() ?? [])]
        .sort((left, right) => String(left.candidate_id).localeCompare(String(right.candidate_id)))
        .map((candidate) => ({
          ...cloneRow(candidate),
          album_art_url: candidate.album_art_url ?? fallback,
          votes: this.voteCount(roundId, String(candidate.candidate_id)),
        }));
      return {rows};
    }

    if (sql.startsWith('select candidate_id from next_song_vote_ballots')) {
      const ballot = this.ballots.get(this.ballotKey(String(values[0]), String(values[1])));
      return {rows: ballot ? [{candidate_id: ballot.candidate_id}] : []};
    }

    if (sql.startsWith('select id, status, source_device_id, opened_at')) {
      const round = this.rounds.get(String(values[0]));
      return {rows: round ? [cloneRow(round)] : []};
    }

    if (sql.startsWith('select id, resolve_at from next_song_vote_rounds')) {
      const excludedId = String(values[0]);
      return {
        rows: [...this.rounds.values()]
          .filter((round) => round.id !== excludedId && ['open', 'locked'].includes(round.status))
          .map((round) => ({id: round.id, resolve_at: round.resolve_at})),
      };
    }

    if (sql.startsWith('update next_song_vote_rounds set status = \'cancelled\'')) {
      const round = this.rounds.get(String(values[0]));
      if (round && ['open', 'locked'].includes(round.status)) round.status = 'cancelled';
      return {rows: []};
    }

    if (sql.startsWith('select candidate_id, song_id, album_art_url, album_art_sha256')) {
      const rows = [...(this.candidates.get(String(values[0]))?.values() ?? [])]
        .sort((left, right) => String(left.candidate_id).localeCompare(String(right.candidate_id)))
        .map(({candidate_id, song_id, album_art_url, album_art_sha256}) => ({
          candidate_id,
          song_id,
          album_art_url,
          album_art_sha256,
        }));
      return {rows};
    }

    if (sql.startsWith('insert into next_song_vote_rounds')) {
      const [idValue, statusValue, openedAt, lockAt, resolveAt, agentId] = values;
      const id = String(idValue);
      const status = String(statusValue);
      const existing = this.rounds.get(id);
      if (existing) {
        existing.status = status;
        existing.lock_at = lockAt ?? existing.lock_at;
        existing.resolve_at = resolveAt ?? existing.resolve_at;
        if (status === 'locked') existing.locked_at ??= this.now.toISOString();
      } else {
        this.rounds.set(id, {
          id,
          status,
          opened_at: openedAt,
          lock_at: lockAt,
          resolve_at: resolveAt,
          locked_at: status === 'locked' ? this.now.toISOString() : null,
          resolved_at: null,
          winner_candidate_id: null,
          resolution_mode: null,
          source_device_id: String(agentId),
        });
      }
      return {rows: []};
    }

    if (sql.startsWith('insert into next_song_vote_candidates')) {
      const [
        roundIdValue,
        candidateIdValue,
        songId,
        title,
        artist,
        albumArtUrl,
        albumArtSha256,
        coverProvided,
      ] = values;
      const roundId = String(roundIdValue);
      const candidateId = String(candidateIdValue);
      const rows = this.candidates.get(roundId) ?? new Map<string, DbRow>();
      const existing = rows.get(candidateId);
      rows.set(candidateId, {
        round_id: roundId,
        candidate_id: candidateId,
        song_id: existing?.song_id ?? String(songId),
        title: String(title),
        artist: String(artist),
        album_art_url: coverProvided ? albumArtUrl : (existing?.album_art_url ?? albumArtUrl),
        album_art_sha256: coverProvided
          ? albumArtSha256
          : (existing?.album_art_sha256 ?? albumArtSha256),
      });
      this.candidates.set(roundId, rows);
      return {rows: []};
    }

    if (sql.startsWith('select is_guest from users')) {
      const user = this.users.get(String(values[0]));
      return {rows: user ? [cloneRow(user)] : []};
    }

    if (sql.startsWith('select id, status, lock_at, now() as server_now')) {
      const round = this.rounds.get(String(values[0]));
      return {rows: round ? [{...cloneRow(round), server_now: this.now.toISOString()}] : []};
    }

    if (sql.startsWith('update next_song_vote_rounds set status = \'locked\'')) {
      const round = this.rounds.get(String(values[0]));
      if (round) {
        round.status = 'locked';
        round.locked_at ??= this.now.toISOString();
      }
      return {rows: []};
    }

    if (sql.startsWith('select candidate_id from next_song_vote_candidates')) {
      const candidate = this.candidates.get(String(values[0]))?.get(String(values[1]));
      return {rows: candidate ? [{candidate_id: candidate.candidate_id}] : []};
    }

    if (sql.startsWith('insert into next_song_vote_ballots')) {
      const [roundIdValue, userIdValue, candidateIdValue] = values;
      const roundId = String(roundIdValue);
      const userId = String(userIdValue);
      this.ballots.set(this.ballotKey(roundId, userId), {
        round_id: roundId,
        user_id: userId,
        candidate_id: String(candidateIdValue),
      });
      return {rows: []};
    }

    if (sql.startsWith('select id, status, source_device_id, resolve_at')) {
      const round = this.rounds.get(String(values[0]));
      return {rows: round ? [{...cloneRow(round), server_now: this.now.toISOString()}] : []};
    }

    if (sql.includes('from next_song_vote_candidates c') && !sql.includes('c.song_id')) {
      const roundId = String(values[0]);
      const rows = [...(this.candidates.get(roundId)?.values() ?? [])]
        .sort((left, right) => String(left.candidate_id).localeCompare(String(right.candidate_id)))
        .map((candidate) => ({
          candidate_id: candidate.candidate_id,
          votes: this.voteCount(roundId, String(candidate.candidate_id)),
        }));
      return {rows};
    }

    if (sql.startsWith('update next_song_vote_rounds set status = \'resolved\'')) {
      const [roundIdValue, winnerCandidateId, resolutionMode] = values;
      const round = this.rounds.get(String(roundIdValue));
      if (round) {
        round.status = 'resolved';
        round.locked_at ??= this.now.toISOString();
        round.resolved_at = this.now.toISOString();
        round.winner_candidate_id = String(winnerCandidateId);
        round.resolution_mode = String(resolutionMode);
      }
      return {rows: []};
    }

    throw new Error(`Unhandled fake SQL: ${sql}`);
  };
}

const openedAt = '2026-07-12T09:59:00.000Z';
const lockAt = '2026-07-12T10:01:00.000Z';
const resolveAt = '2026-07-12T10:02:00.000Z';

function roundPayload(
  id = 'round-1',
  overrides: Partial<VotingRoundPublishInput> = {},
): VotingRoundPublishInput {
  return {
    id,
    status: 'open',
    openedAt,
    lockAt,
    resolveAt,
    lockedAt: null,
    resolvedAt: null,
    winnerCandidateId: null,
    resolutionMode: null,
    candidates: [
      {
        id: 'candidate-1',
        songId: 'song-1',
        title: 'Campus Lights',
        artist: 'RadioTEDU',
        albumArtUrl: 'https://cdn.example.test/campus-lights.jpg',
        votes: 999,
      },
      {
        id: 'candidate-2',
        songId: 'song-2',
        title: 'Night Radio',
        artist: 'RadioTEDU',
        albumArtUrl: null,
        votes: 500,
      },
      {
        id: 'candidate-3',
        songId: 'song-3',
        title: 'Signal Three',
        artist: 'RadioTEDU',
        albumArtUrl: null,
        votes: 250,
      },
    ],
    ...overrides,
  };
}

function makeService(database: FakeVotingDatabase, chooseIndex = 0) {
  const emit = vi.fn();
  const service = createNextSongVotingService({
    query: database.query,
    pool: database.pool as any,
    emit,
    chooseIndex: vi.fn(() => chooseIndex),
  });
  return {service, emit};
}

async function expectVotingError(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toMatchObject<VotingServiceError>({code, httpStatus: status});
}

describe('nextSongVotingService', () => {
  beforeEach(() => {
    coverMocks.remove.mockClear();
    coverMocks.store.mockClear();
  });

  it('publishes atomically and ignores vote totals supplied by the agent', async () => {
    const database = new FakeVotingDatabase();
    const {service, emit} = makeService(database);

    const round = await service.publishRound(roundPayload(), 'school-radio-pc');

    expect(database.transactionLog).toEqual(['BEGIN', 'COMMIT']);
    expect(database.calls.some(({sql}) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(round.candidates.map((candidate) => candidate.votes)).toEqual([0, 0, 0]);
    expect(emit).toHaveBeenCalledWith('next_vote_round_started', expect.objectContaining({id: 'round-1'}));
  });

  it('keeps candidate identity immutable when an agent republishes a round', async () => {
    const database = new FakeVotingDatabase();
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    const changedCandidates = roundPayload().candidates.map((candidate, index) => (
      index === 0 ? {...candidate, songId: 'different-song'} : candidate
    ));

    await expectVotingError(
      service.publishRound(roundPayload('round-1', {candidates: changedCandidates}), 'school-radio-pc'),
      'round_candidates_immutable',
      409,
    );

    expect(database.candidates.get('round-1')?.get('candidate-1')?.song_id).toBe('song-1');
    expect(database.transactionLog.at(-1)).toBe('ROLLBACK');
  });

  it('keeps an existing round schedule immutable across agent republishes', async () => {
    const database = new FakeVotingDatabase();
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');

    await expectVotingError(service.publishRound(roundPayload('round-1', {
      lockAt: '2026-07-12T10:05:00.000Z',
      resolveAt: '2026-07-12T10:06:00.000Z',
    }), 'school-radio-pc'), 'round_schedule_immutable', 409);

    expect(database.rounds.get('round-1')).toMatchObject({lock_at: lockAt, resolve_at: resolveAt});
  });

  it('rejects a round without the complete server schedule or exactly three candidates', async () => {
    const database = new FakeVotingDatabase();
    const {service} = makeService(database);

    await expectVotingError(service.publishRound({...roundPayload(), lockAt: null}, 'school-radio-pc'), 'invalid_round_payload', 400);
    await expectVotingError(service.publishRound({
      ...roundPayload(),
      candidates: roundPayload().candidates.slice(0, 2),
    }, 'school-radio-pc'), 'invalid_round_payload', 400);
    expect(database.rounds.size).toBe(0);
  });

  it('allows only one non-stale active round', async () => {
    const database = new FakeVotingDatabase();
    const {service, emit} = makeService(database);
    await service.publishRound(roundPayload('round-1'), 'school-radio-pc');

    await expectVotingError(
      service.publishRound(roundPayload('round-2'), 'school-radio-pc'),
      'active_round_exists',
      409,
    );

    expect(database.rounds.has('round-2')).toBe(false);
    expect(database.rounds.get('round-1')?.status).toBe('open');
  });

  it('rejects guests and unknown accounts before writing a ballot', async () => {
    const database = new FakeVotingDatabase();
    database.users.set('guest-1', {is_guest: true});
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');

    await expectVotingError(service.castVote('round-1', 'candidate-1', 'guest-1'), 'registered_account_required', 403);
    await expectVotingError(service.castVote('round-1', 'candidate-1', 'missing-user'), 'registered_account_required', 403);

    expect(database.ballots.size).toBe(0);
  });

  it('uses database time to close the lock-boundary race and records no late ballot', async () => {
    const database = new FakeVotingDatabase();
    database.users.set('user-1', {is_guest: false});
    const {service, emit} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    database.now = new Date(lockAt);

    await expectVotingError(service.castVote('round-1', 'candidate-1', 'user-1'), 'round_not_open', 409);

    expect(database.ballots.size).toBe(0);
    expect(database.rounds.get('round-1')?.status).toBe('locked');
    expect(emit).toHaveBeenCalledWith('next_vote_round_locked', expect.objectContaining({id: 'round-1'}));
  });

  it('upserts one ballot per user and returns the current normalized round', async () => {
    const database = new FakeVotingDatabase();
    database.users.set('user-1', {is_guest: false});
    const {service, emit} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');

    const first = await service.castVote('round-1', 'candidate-1', 'user-1');
    const changed = await service.castVote('round-1', 'candidate-2', 'user-1');

    expect(first.userVoteCandidateId).toBe('candidate-1');
    expect(changed).toMatchObject({
      id: 'round-1',
      userVoteCandidateId: 'candidate-2',
      winnerCandidateId: null,
    });
    expect(changed.candidates.map(({id, votes}) => ({id, votes}))).toEqual([
      {id: 'candidate-1', votes: 0},
      {id: 'candidate-2', votes: 1},
      {id: 'candidate-3', votes: 0},
    ]);
    expect(database.ballots.size).toBe(1);
    expect(database.calls.filter(({sql}) => sql.startsWith('insert into next_song_vote_ballots'))).toHaveLength(2);
    const publicUpdate = emit.mock.calls.filter(([event]) => event === 'next_vote_round_updated').at(-1)?.[1];
    expect(publicUpdate).toMatchObject({id: 'round-1', userVoteCandidateId: null});
  });

  it('resolves from backend ballot totals when one candidate has the most user votes', async () => {
    const database = new FakeVotingDatabase();
    database.users.set('user-1', {is_guest: false});
    database.users.set('user-2', {is_guest: false});
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    await service.castVote('round-1', 'candidate-1', 'user-1');
    await service.castVote('round-1', 'candidate-1', 'user-2');
    database.now = new Date('2026-07-12T10:03:00.000Z');

    const result = await service.resolveRound('round-1', 'school-radio-pc');

    expect(result).toMatchObject({
      status: 'resolved',
      winnerCandidateId: 'candidate-1',
      resolutionMode: 'user-vote',
    });
  });

  it('uses the injected cryptographic chooser only among tied leaders', async () => {
    const database = new FakeVotingDatabase();
    database.users.set('user-1', {is_guest: false});
    database.users.set('user-2', {is_guest: false});
    const {service} = makeService(database, 1);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    await service.castVote('round-1', 'candidate-1', 'user-1');
    await service.castVote('round-1', 'candidate-2', 'user-2');
    database.now = new Date('2026-07-12T10:03:00.000Z');

    const result = await service.resolveRound('round-1', 'school-radio-pc');

    expect(result).toMatchObject({winnerCandidateId: 'candidate-2', resolutionMode: 'tie-break'});
  });

  it('chooses a no-vote fallback once and keeps the result idempotent', async () => {
    const database = new FakeVotingDatabase();
    const {service, emit} = makeService(database, 1);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    database.now = new Date('2026-07-12T10:03:00.000Z');

    const first = await service.resolveRound('round-1', 'school-radio-pc');
    const second = await service.resolveRound('round-1', 'school-radio-pc');

    expect(first).toMatchObject({winnerCandidateId: 'candidate-2', resolutionMode: 'no-vote-fallback'});
    expect(second.winnerCandidateId).toBe(first.winnerCandidateId);
    expect(database.calls.filter(({sql}) => sql.startsWith('update next_song_vote_rounds set status = \'resolved\''))).toHaveLength(1);
    expect(emit.mock.calls.filter(([event]) => event === 'next_vote_round_resolved')).toHaveLength(1);
  });

  it('scopes active and resolve operations to the connected agent', async () => {
    const database = new FakeVotingDatabase();
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');

    const ownActive = await service.handleAgentRequest('school-radio-pc', 'round.active', {});
    const otherActive = await service.handleAgentRequest('other-radio-pc', 'round.active', {});
    database.now = new Date('2026-07-12T10:03:00.000Z');

    expect(ownActive.round).toMatchObject({id: 'round-1'});
    expect(otherActive.round).toBeNull();
    await expectVotingError(service.resolveRound('round-1', 'other-radio-pc'), 'round_agent_mismatch', 403);
    expect(database.rounds.get('round-1')?.status).toBe('open');
  });

  it('recovers a recently resolved authoritative round for a reconnecting agent', async () => {
    const database = new FakeVotingDatabase();
    const {service} = makeService(database);
    await service.publishRound(roundPayload(), 'school-radio-pc');
    database.now = new Date('2026-07-12T10:03:00.000Z');
    const resolved = await service.resolveRound('round-1', 'school-radio-pc');

    const recovered = await service.handleAgentRequest('school-radio-pc', 'round.active', {});
    expect(recovered.round).toMatchObject({
      id: resolved.id,
      status: 'resolved',
      winnerCandidateId: resolved.winnerCandidateId,
    });
  });
});

describe('resolveVotingStreamUrl', () => {
  it('returns only the fixed public HTTPS /ai listener URL', () => {
    expect(resolveVotingStreamUrl('https://stream.radiotedu.com/ai')).toBe('https://stream.radiotedu.com/ai');
    expect(resolveVotingStreamUrl('http://stream.radiotedu.com:11154/ai?password=secret'))
      .toBe('https://stream.radiotedu.com/ai');
    expect(resolveVotingStreamUrl('https://127.0.0.1/ai')).toBe('https://stream.radiotedu.com/ai');
  });
});
