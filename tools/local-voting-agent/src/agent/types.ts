export type CandidateCount = 2 | 3;

export type PlaybackMode = 'dry-run' | 'live';

export interface AgentConfig {
  candidateCount: CandidateCount;
  catalogPath: string;
  musicRoots: string[];
  jingleRoots: string[];
  jingleBeforeWinner: boolean;
  artCacheDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  playbackMode: PlaybackMode;
  serverPort: number;
  backend: AgentBackendConfig;
}

export interface AgentBackendConfig {
  apiBaseUrl: string;
  agentToken: string;
  deviceId: string;
  enabled: boolean;
}

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  filePath: string;
  albumArtPath?: string | null;
  enabled?: boolean;
  durationSeconds?: number;
}

export interface JingleTrack {
  id: string;
  title: string;
  filePath: string;
  enabled?: boolean;
}

export interface VotingCandidate {
  id: string;
  songId: string;
  title: string;
  artist: string;
  filePath: string;
  albumArtUrl: string | null;
  votes: number;
}

export type RoundStatus = 'open' | 'locked' | 'resolved';

export type RoundResolutionMode = 'user-vote' | 'tie-break' | 'no-vote-fallback';

export interface VoteRecord {
  userId: string;
  candidateId: string;
  acceptedAt: string;
  rewardKey: string;
}

export interface VotingRound {
  id: string;
  status: RoundStatus;
  openedAt: string;
  lockedAt: string | null;
  resolvedAt: string | null;
  candidates: VotingCandidate[];
  votes: VoteRecord[];
  winnerCandidateId: string | null;
  resolutionMode: RoundResolutionMode | null;
}

export type PlaybackPlanEntryKind = 'jingle' | 'winner';

export interface PlaybackPlanEntry {
  kind: PlaybackPlanEntryKind;
  title: string;
  filePath: string;
  ffmpegArgs: string[];
}

export interface PlaybackPlan {
  mode: PlaybackMode;
  entries: PlaybackPlanEntry[];
}
