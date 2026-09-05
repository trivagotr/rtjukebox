import {beforeEach, describe, expect, it, vi} from 'vitest';

const {
  MockVotingServiceError,
  mockAuthMiddleware,
  mockHandlers,
  mockOptionalAuth,
  mockRouter,
  mockSendError,
  mockSendSuccess,
  mockService,
} = vi.hoisted(() => {
  class RouteVotingServiceError extends Error {
    constructor(
      public readonly code: string,
      public readonly httpStatus: number,
    ) {
      super(code);
    }
  }

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
    MockVotingServiceError: RouteVotingServiceError,
    mockAuthMiddleware: vi.fn(),
    mockHandlers: handlers,
    mockOptionalAuth: vi.fn(),
    mockRouter: router,
    mockSendError: vi.fn(),
    mockSendSuccess: vi.fn(),
    mockService: {
      castVote: vi.fn(),
      getActiveRound: vi.fn(),
      getStatus: vi.fn(),
      loadRound: vi.fn(),
      publishRound: vi.fn(),
      resolveRound: vi.fn(),
    },
  };
});

vi.mock('express', () => ({Router: vi.fn(() => mockRouter)}));
vi.mock('../middleware/auth', () => ({
  authMiddleware: mockAuthMiddleware,
  optionalAuth: mockOptionalAuth,
}));
vi.mock('../services/nextSongVotingService', () => ({
  nextSongVotingService: mockService,
  VotingServiceError: MockVotingServiceError,
}));
vi.mock('../utils/response', () => ({sendError: mockSendError, sendSuccess: mockSendSuccess}));

process.env.NEXT_SONG_VOTING_AGENT_TOKEN = 'broadcast-agent-token';
process.env.NEXT_SONG_VOTING_AGENT_DEVICE_ID = 'broadcast-pc-1';

import './nextSongVoting';

const normalizedRound = {
  id: 'round-1',
  status: 'open',
  openedAt: '2026-07-12T10:00:00.000Z',
  lockAt: '2026-07-12T10:01:00.000Z',
  resolveAt: '2026-07-12T10:02:00.000Z',
  lockedAt: null,
  resolvedAt: null,
  serverNow: '2026-07-12T10:00:10.000Z',
  candidates: [
    {
      id: 'candidate-1',
      songId: 'song-1',
      title: 'Campus Lights',
      artist: 'RadioTEDU',
      albumArtUrl: '/jukebox/uploads/voting/campus-lights.webp',
      votes: 1,
    },
    {
      id: 'candidate-2',
      songId: 'song-2',
      title: 'Night Radio',
      artist: 'RadioTEDU',
      albumArtUrl: '/jukebox/assets/voting-fallback.webp',
      votes: 0,
    },
    {
      id: 'candidate-3',
      songId: 'song-3',
      title: 'Signal Three',
      artist: 'RadioTEDU',
      albumArtUrl: '/jukebox/assets/voting-fallback.webp',
      votes: 0,
    },
  ],
  userVoteCandidateId: 'candidate-1',
  winnerCandidateId: null,
  resolutionMode: null,
};

const agentRound = {
  id: 'round-1',
  status: 'open',
  openedAt: '2026-07-12T10:00:00.000Z',
  lockAt: '2026-07-12T10:01:00.000Z',
  resolveAt: '2026-07-12T10:02:00.000Z',
  candidates: normalizedRound.candidates.map((candidate) => ({...candidate, votes: 999})),
};

describe('next-song voting routes', () => {
  beforeEach(() => {
    mockSendError.mockReset();
    mockSendSuccess.mockReset();
    Object.values(mockService).forEach((serviceMethod) => serviceMethod.mockReset());
    process.env.NEXT_SONG_VOTING_AGENT_TOKEN = 'broadcast-agent-token';
    process.env.NEXT_SONG_VOTING_AGENT_DEVICE_ID = 'broadcast-pc-1';
  });

  it('registers optional auth for reads and required auth for votes', () => {
    const activeRegistration = mockRouter.get.mock.calls.find(([path]: [string]) => path === '/rounds/active');
    const resultRegistration = mockRouter.get.mock.calls.find(([path]: [string]) => path === '/rounds/:roundId/result');
    const voteRegistration = mockRouter.post.mock.calls.find(([path]: [string]) => path === '/rounds/:roundId/votes');

    expect(activeRegistration?.[1]).toBe(mockOptionalAuth);
    expect(resultRegistration?.[1]).toBe(mockOptionalAuth);
    expect(voteRegistration?.[1]).toBe(mockAuthMiddleware);
  });

  it('returns a backend-owned 426 fallback for a non-upgraded agent connection', async () => {
    await mockHandlers.get['/agent/connect']({}, {});

    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'WebSocket upgrade required',
      426,
      'websocket_upgrade_required',
    );
  });

  it('rejects legacy HTTP publication without both configured agent credentials', async () => {
    await mockHandlers.post['/agent/rounds'](
      {headers: {authorization: 'Bearer wrong', 'x-rt-device-id': 'broadcast-pc-1'}, body: agentRound},
      {},
    );

    expect(mockService.publishRound).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Invalid voting agent credentials',
      401,
      'invalid_agent_credentials',
    );
  });

  it('keeps the explicitly configured bearer transport as a scoped fallback', async () => {
    mockService.publishRound.mockResolvedValue(normalizedRound);

    await mockHandlers.post['/agent/rounds'](
      {
        headers: {
          authorization: 'Bearer broadcast-agent-token',
          'x-rt-device-id': 'broadcast-pc-1',
        },
        body: agentRound,
      },
      {},
    );

    expect(mockService.publishRound).toHaveBeenCalledWith(agentRound, 'broadcast-pc-1');
    expect(mockSendSuccess).toHaveBeenCalledWith({}, {round: normalizedRound}, 'Voting round published');
  });

  it('uses optional identity for active-round reads and supports anonymous reads', async () => {
    mockService.getActiveRound
      .mockResolvedValueOnce(normalizedRound)
      .mockResolvedValueOnce(null);
    const handler = mockHandlers.get['/rounds/active'];

    await handler({user: {id: 'user-1'}}, {});
    await handler({}, {});

    expect(mockService.getActiveRound).toHaveBeenNthCalledWith(1, 'user-1');
    expect(mockService.getActiveRound).toHaveBeenNthCalledWith(2, null);
    expect(mockSendSuccess).toHaveBeenNthCalledWith(1, {}, {round: normalizedRound}, 'Active voting round');
    expect(mockSendSuccess).toHaveBeenNthCalledWith(2, {}, {round: null}, 'No active voting round');
  });

  it('rejects a vote if auth middleware did not establish a registered identity', async () => {
    await mockHandlers.post['/rounds/:roundId/votes'](
      {params: {roundId: 'round-1'}, body: {candidateId: 'candidate-1'}},
      {},
    );

    expect(mockService.castVote).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(
      {},
      'Authentication required',
      401,
      'authentication_required',
    );
  });

  it('accepts legacy candidate_id/device_id fields but takes user identity only from the JWT', async () => {
    mockService.castVote.mockResolvedValue(normalizedRound);

    await mockHandlers.post['/rounds/:roundId/votes'](
      {
        params: {roundId: 'round-1'},
        body: {candidate_id: 'candidate-1', device_id: 'spoofed-user-or-device'},
        user: {id: 'user-1', role: 'user'},
      },
      {},
    );

    expect(mockService.castVote).toHaveBeenCalledWith('round-1', 'candidate-1', 'user-1');
    expect(mockSendSuccess).toHaveBeenCalledWith({}, {round: normalizedRound}, 'Vote recorded');
  });

  it('rejects ambiguous candidate fields instead of silently choosing one', async () => {
    await mockHandlers.post['/rounds/:roundId/votes'](
      {
        params: {roundId: 'round-1'},
        body: {candidateId: 'candidate-1', candidate_id: 'candidate-2'},
        user: {id: 'user-1'},
      },
      {},
    );

    expect(mockService.castVote).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith({}, 'Invalid vote request', 400, 'invalid_vote_payload');
  });

  it('returns a normalized result and an explicit 404 for an unknown round', async () => {
    mockService.loadRound
      .mockResolvedValueOnce(normalizedRound)
      .mockResolvedValueOnce(null);
    const handler = mockHandlers.get['/rounds/:roundId/result'];

    await handler({params: {roundId: 'round-1'}, user: {id: 'user-1'}}, {});
    await handler({params: {roundId: 'missing-round'}}, {});

    expect(mockService.loadRound).toHaveBeenNthCalledWith(1, 'round-1', 'user-1');
    expect(mockService.loadRound).toHaveBeenNthCalledWith(2, 'missing-round', null);
    expect(mockSendSuccess).toHaveBeenCalledWith({}, {round: normalizedRound}, 'Voting round result');
    expect(mockSendError).toHaveBeenCalledWith({}, 'Voting round not found', 404, 'round_not_found');
  });

  it('returns public status without transforming the service contract', async () => {
    const status = {
      agent: {agentId: 'school-radio-pc', connected: true, lastSeen: '2026-07-12T10:00:10.000Z'},
      activeRound: {id: 'round-1', status: 'open', openedAt: normalizedRound.openedAt},
      streamUrl: 'https://stream.radiotedu.com/ai',
      serverNow: normalizedRound.serverNow,
    };
    mockService.getStatus.mockResolvedValue(status);

    await mockHandlers.get['/status']({}, {});

    expect(mockSendSuccess).toHaveBeenCalledWith({}, status, 'Voting service status');
  });

  it('maps stable service error codes without exposing internal details', async () => {
    mockService.castVote.mockRejectedValue(new MockVotingServiceError('registered_account_required', 403));

    await mockHandlers.post['/rounds/:roundId/votes'](
      {
        params: {roundId: 'round-1'},
        body: {candidateId: 'candidate-1'},
        user: {id: 'guest-1'},
      },
      {},
    );

    expect(mockSendError).toHaveBeenCalledWith({}, 'Voting request failed', 403, 'registered_account_required');
  });
});
