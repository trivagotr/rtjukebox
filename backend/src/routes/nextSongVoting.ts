import {timingSafeEqual} from 'node:crypto';
import {Router, type Request, type Response} from 'express';
import {z} from 'zod';

import {authMiddleware, type AuthRequest, optionalAuth} from '../middleware/auth';
import {
  nextSongVotingService,
  VotingServiceError,
} from '../services/nextSongVotingService';
import {sendError, sendSuccess} from '../utils/response';

const router = Router();

const voteSchema = z.object({
  candidateId: z.string().trim().min(1).max(120).optional(),
  candidate_id: z.string().trim().min(1).max(120).optional(),
  // Retained only for older mobile clients; authenticated user identity is
  // always taken from the JWT and this device hint is intentionally ignored.
  device_id: z.string().trim().min(1).max(120).optional(),
}).strict().transform((value, context) => {
  const candidateId = value.candidateId ?? value.candidate_id;
  if (!candidateId || (value.candidateId && value.candidate_id && value.candidateId !== value.candidate_id)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: 'invalid_candidate_id'});
    return z.NEVER;
  }
  return {candidateId};
});

function safeStringEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function trustedHttpAgentId(request: Request): string | null {
  const expectedToken = process.env.NEXT_SONG_VOTING_AGENT_TOKEN?.trim() ?? '';
  const expectedDeviceId = process.env.NEXT_SONG_VOTING_AGENT_DEVICE_ID?.trim() ?? '';
  const authorization = request.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const deviceId = typeof request.headers['x-rt-device-id'] === 'string'
    ? request.headers['x-rt-device-id'].trim()
    : '';

  if (!expectedToken || !expectedDeviceId || !token || !deviceId) return null;
  return safeStringEqual(token, expectedToken) && safeStringEqual(deviceId, expectedDeviceId)
    ? deviceId
    : null;
}

function sendVotingError(response: Response, error: unknown) {
  if (error instanceof VotingServiceError) {
    return sendError(response, 'Voting request failed', error.httpStatus, error.code);
  }
  return sendError(response, 'Voting request failed', 500, 'voting_internal_error');
}

router.get('/agent/connect', (_request, response) => {
  return sendError(response, 'WebSocket upgrade required', 426, 'websocket_upgrade_required');
});

// Legacy outbound HTTP transport remains available only when its dedicated
// bearer token and device ID are explicitly configured.
router.post('/agent/rounds', async (request: Request, response: Response) => {
  const agentId = trustedHttpAgentId(request);
  if (!agentId) return sendError(response, 'Invalid voting agent credentials', 401, 'invalid_agent_credentials');
  try {
    const round = await nextSongVotingService.publishRound(request.body, agentId);
    return sendSuccess(response, {round}, 'Voting round published');
  } catch (error) {
    return sendVotingError(response, error);
  }
});

router.post('/agent/rounds/:roundId/resolve', async (request: Request, response: Response) => {
  const agentId = trustedHttpAgentId(request);
  if (!agentId) return sendError(response, 'Invalid voting agent credentials', 401, 'invalid_agent_credentials');
  try {
    const round = await nextSongVotingService.resolveRound(request.params.roundId, agentId);
    return sendSuccess(response, {round}, 'Voting round resolved');
  } catch (error) {
    return sendVotingError(response, error);
  }
});

router.get('/rounds/active', optionalAuth, async (request: AuthRequest, response: Response) => {
  try {
    const round = await nextSongVotingService.getActiveRound(request.user?.id ?? null);
    return sendSuccess(response, {round}, round ? 'Active voting round' : 'No active voting round');
  } catch (error) {
    return sendVotingError(response, error);
  }
});

router.get('/rounds/:roundId/result', optionalAuth, async (request: AuthRequest, response: Response) => {
  try {
    const round = await nextSongVotingService.loadRound(request.params.roundId, request.user?.id ?? null);
    if (!round) return sendError(response, 'Voting round not found', 404, 'round_not_found');
    return sendSuccess(response, {round}, 'Voting round result');
  } catch (error) {
    return sendVotingError(response, error);
  }
});

router.post('/rounds/:roundId/votes', authMiddleware, async (request: AuthRequest, response: Response) => {
  try {
    const {candidateId} = voteSchema.parse(request.body);
    if (!request.user?.id) return sendError(response, 'Authentication required', 401, 'authentication_required');
    const round = await nextSongVotingService.castVote(request.params.roundId, candidateId, request.user.id);
    return sendSuccess(response, {round}, 'Vote recorded');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(response, 'Invalid vote request', 400, 'invalid_vote_payload');
    }
    return sendVotingError(response, error);
  }
});

router.get('/status', async (_request: Request, response: Response) => {
  try {
    return sendSuccess(response, await nextSongVotingService.getStatus(), 'Voting service status');
  } catch (error) {
    return sendVotingError(response, error);
  }
});

export {trustedHttpAgentId};
export default router;
