import type { AgentBackendConfig, VotingRound } from './types';

export interface BackendRoundCandidatePayload {
  id: string;
  songId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  votes: number;
}

export interface BackendRoundPayload {
  id: string;
  status: VotingRound['status'];
  openedAt: string;
  lockedAt: string | null;
  resolvedAt: string | null;
  candidates: BackendRoundCandidatePayload[];
  winnerCandidateId: string | null;
  resolutionMode: VotingRound['resolutionMode'];
}

export interface BackendVotingClient {
  publishRound(round: VotingRound): Promise<void>;
}

export function buildAgentHeaders(config: AgentBackendConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.agentToken}`,
    'Content-Type': 'application/json',
    'X-RT-Device-Id': config.deviceId,
  };
}

export function buildBackendRoundPayload(round: VotingRound): BackendRoundPayload {
  return {
    id: round.id,
    status: round.status,
    openedAt: round.openedAt,
    lockedAt: round.lockedAt,
    resolvedAt: round.resolvedAt,
    candidates: round.candidates.map((candidate) => ({
      id: candidate.id,
      songId: candidate.songId,
      title: candidate.title,
      artist: candidate.artist,
      albumArtUrl: candidate.albumArtUrl,
      votes: candidate.votes,
    })),
    winnerCandidateId: round.winnerCandidateId,
    resolutionMode: round.resolutionMode,
  };
}

export function createBackendVotingClient(
  config: AgentBackendConfig,
  fetchImpl: typeof fetch = fetch,
): BackendVotingClient | null {
  if (!config.enabled) {
    return null;
  }

  return {
    async publishRound(round: VotingRound) {
      const response = await fetchImpl(`${config.apiBaseUrl.replace(/\/$/, '')}/api/v1/jukebox/voting/agent/rounds`, {
        method: 'POST',
        headers: buildAgentHeaders(config),
        body: JSON.stringify(buildBackendRoundPayload(round)),
      });

      if (!response.ok) {
        throw new Error(`backend_round_publish_failed:${response.status}`);
      }
    },
  };
}
