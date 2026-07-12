import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockDbQuery, mockHandlers, mockRouter, mockSendError, mockSendSuccess} = vi.hoisted(() => {
  const handlers: Record<string, Record<string, (...args: any[]) => any>> = {get: {}, post: {}};
  const router: any = {
    get: vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
      handlers.get[path] = routeHandlers.at(-1)!;
      return router;
    }),
    post: vi.fn((path: string, ...routeHandlers: Array<(...args: any[]) => any>) => {
      handlers.post[path] = routeHandlers.at(-1)!;
      return router;
    }),
  };

  return {
    mockDbQuery: vi.fn(),
    mockHandlers: handlers,
    mockRouter: router,
    mockSendError: vi.fn(),
    mockSendSuccess: vi.fn(),
  };
});

vi.mock('express', () => ({Router: vi.fn(() => mockRouter)}));
vi.mock('../db', () => ({db: {query: mockDbQuery}}));
vi.mock('../middleware/auth', () => ({authMiddleware: vi.fn(), optionalAuth: vi.fn()}));
vi.mock('../utils/response', () => ({sendError: mockSendError, sendSuccess: mockSendSuccess}));

process.env.NEXT_SONG_VOTING_AGENT_TOKEN = 'broadcast-agent-token';
process.env.NEXT_SONG_VOTING_AGENT_DEVICE_ID = 'broadcast-pc-1';

import './nextSongVoting';

const publishedRound = {
  id: 'round-1',
  status: 'open',
  openedAt: '2026-07-12T10:00:00.000Z',
  lockedAt: null,
  resolvedAt: null,
  candidates: [
    {id: 'candidate-1', songId: 'song-1', title: 'Campus Lights', artist: 'RadioTEDU', albumArtUrl: null, votes: 999},
    {id: 'candidate-2', songId: 'song-2', title: 'Night Radio', artist: 'RadioTEDU', albumArtUrl: null, votes: 0},
  ],
  winnerCandidateId: null,
  resolutionMode: null,
};

describe('next-song voting routes', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockSendError.mockReset();
    mockSendSuccess.mockReset();
  });

  it('rejects a round publication without the configured broadcast device credentials', async () => {
    const handler = mockHandlers.post['/agent/rounds'];

    await handler({headers: {authorization: 'Bearer wrong', 'x-rt-device-id': 'broadcast-pc-1'}, body: publishedRound}, {});

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid voting agent credentials', 401);
  });

  it('records one server-authoritative ballot per registered user', async () => {
    const handler = mockHandlers.post['/rounds/:roundId/votes'];
    mockDbQuery
      .mockResolvedValueOnce({rows: [{is_guest: false}]})
      .mockResolvedValueOnce({rows: [{id: 'candidate-1'}]})
      .mockResolvedValueOnce({rows: [{candidate_id: 'candidate-1', votes: 1}]});

    await handler(
      {params: {roundId: 'round-1'}, body: {candidateId: 'candidate-1'}, user: {id: 'user-1', role: 'user'}},
      {},
    );

    expect(mockDbQuery.mock.calls[2][0]).toContain('ON CONFLICT (round_id, user_id)');
    expect(mockDbQuery.mock.calls[2][1]).toEqual(['round-1', 'user-1', 'candidate-1']);
    expect(mockSendSuccess).toHaveBeenCalledWith(
      {},
      expect.objectContaining({roundId: 'round-1', candidateId: 'candidate-1'}),
      'Vote recorded',
    );
  });
});
