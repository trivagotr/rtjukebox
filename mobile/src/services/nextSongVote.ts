import AsyncStorage from '@react-native-async-storage/async-storage';
import api, {API_ORIGIN} from './api';

export const NEXT_SONG_VOTE_ACTIVE_ROUND_PATH =
  '/next-song-voting/rounds/active';
export const NEXT_SONG_VOTE_CLIENT_ID_KEY = 'next_song_voting_client_id';

export type NextSongVoteRoundStatus =
  | 'active'
  | 'locked'
  | 'resolved'
  | 'cancelled';

export interface NextSongVoteCandidate {
  id: string;
  externalId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  voteScore: number;
  voteCount: number;
  position: number | null;
}

export interface NextSongVoteRound {
  id: string;
  status: NextSongVoteRoundStatus;
  prompt: string;
  winningCandidateId: string | null;
  voteCount: number;
  userVoteCandidateId: string | null;
  candidates: NextSongVoteCandidate[];
}

interface ClientStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object');
}

function pickRound(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.data) && isRecord(payload.data.round)) {
    return payload.data.round;
  }

  if (isRecord(payload.data)) {
    return payload.data;
  }

  if (isRecord(payload.round)) {
    return payload.round;
  }

  return payload;
}

function normalizeStatus(value: unknown): NextSongVoteRoundStatus {
  return value === 'locked' || value === 'resolved' || value === 'cancelled'
    ? value
    : 'active';
}

function normalizeCandidate(
  candidate: Record<string, any>,
): NextSongVoteCandidate {
  return {
    id: String(candidate.id ?? ''),
    externalId: String(candidate.externalId ?? candidate.external_id ?? ''),
    title: String(candidate.title ?? ''),
    artist: String(candidate.artist ?? ''),
    artworkUrl:
      typeof candidate.artworkUrl === 'string' ? candidate.artworkUrl : null,
    voteScore: Number(candidate.voteScore ?? candidate.vote_score ?? 0),
    voteCount: Number(candidate.voteCount ?? candidate.vote_count ?? 0),
    position:
      candidate.position === null || candidate.position === undefined
        ? null
        : Number(candidate.position),
  };
}

export function normalizeNextSongVoteRound(
  payload: unknown,
): NextSongVoteRound | null {
  const round = pickRound(payload);
  if (
    !isRecord(round) ||
    typeof round.id !== 'string' ||
    !Array.isArray(round.candidates)
  ) {
    return null;
  }

  return {
    id: round.id,
    status: normalizeStatus(round.status),
    prompt:
      typeof round.prompt === 'string'
        ? round.prompt
        : 'Sıradaki şarkı için oy ver',
    winningCandidateId:
      typeof round.winningCandidateId === 'string'
        ? round.winningCandidateId
        : typeof round.winning_candidate_id === 'string'
        ? round.winning_candidate_id
        : null,
    voteCount: Number(round.voteCount ?? round.vote_count ?? 0),
    userVoteCandidateId:
      typeof round.userVoteCandidateId === 'string'
        ? round.userVoteCandidateId
        : typeof round.user_vote_candidate_id === 'string'
        ? round.user_vote_candidate_id
        : null,
    candidates: round.candidates.filter(isRecord).map(normalizeCandidate),
  };
}

function createClientId(random: () => number): string {
  return `nsv-${random().toString(36).slice(2, 13)}`;
}

export async function getOrCreateNextSongVoteClientId(
  storage: ClientStorage = AsyncStorage,
  random: () => number = Math.random,
): Promise<string> {
  const existing = await storage.getItem(NEXT_SONG_VOTE_CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const clientId = createClientId(random);
  await storage.setItem(NEXT_SONG_VOTE_CLIENT_ID_KEY, clientId);
  return clientId;
}

export async function buildNextSongVoteRequestConfig(
  storage: ClientStorage = AsyncStorage,
  random: () => number = Math.random,
) {
  const clientId = await getOrCreateNextSongVoteClientId(storage, random);
  return {
    headers: {
      'x-client-id': clientId,
    },
  };
}

export async function buildNextSongVoteBody(candidateId: string) {
  return {
    candidateId,
  };
}

export function buildNextSongVotePath(roundId: string) {
  return `/next-song-voting/rounds/${roundId}/votes`;
}

function isLocalPath(value: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('file://') ||
    value.startsWith('\\\\') ||
    value.includes('\\')
  );
}

export function getCandidateArtworkUrl(
  candidate: Pick<NextSongVoteCandidate, 'artworkUrl'>,
  publicOrigin = API_ORIGIN,
): string | null {
  if (!candidate.artworkUrl || isLocalPath(candidate.artworkUrl)) {
    return null;
  }

  if (/^https?:\/\//i.test(candidate.artworkUrl)) {
    return candidate.artworkUrl;
  }

  return candidate.artworkUrl.startsWith('/')
    ? `${publicOrigin}${candidate.artworkUrl}`
    : null;
}

export function getWinningCandidate(
  round: NextSongVoteRound | null,
): NextSongVoteCandidate | null {
  if (!round?.winningCandidateId) {
    return null;
  }

  return (
    round.candidates.find(
      candidate => candidate.id === round.winningCandidateId,
    ) ?? null
  );
}

export function getNextSongVoteStatusCopy(
  round: NextSongVoteRound | null,
): string {
  if (!round) {
    return 'Şu an aktif oylama yok';
  }

  if (round.status === 'locked') {
    return 'Oylar kilitlendi';
  }

  if (round.status === 'cancelled') {
    return 'Åžu an aktif oylama yok';
  }

  if (round.status === 'resolved') {
    return 'Sıradaki şarkı seçildi';
  }

  return round.prompt;
}

export function getNextSongVoteErrorCopy(error: unknown): string {
  if (isRecord(error) && isRecord(error.response)) {
    if (error.response.status === 409) {
      return 'Oylama kapandı.';
    }

    if (
      isRecord(error.response.data) &&
      typeof error.response.data.error === 'string'
    ) {
      return error.response.data.error;
    }
  }

  return 'Oy gönderilemedi.';
}

export async function fetchActiveNextSongVoteRound(): Promise<NextSongVoteRound | null> {
  const response = await api.get(
    NEXT_SONG_VOTE_ACTIVE_ROUND_PATH,
    await buildNextSongVoteRequestConfig(),
  );
  return normalizeNextSongVoteRound(response.data);
}

export async function submitNextSongVote(
  roundId: string,
  candidateId: string,
): Promise<NextSongVoteRound | null> {
  const response = await api.post(
    buildNextSongVotePath(roundId),
    await buildNextSongVoteBody(candidateId),
    await buildNextSongVoteRequestConfig(),
  );

  return normalizeNextSongVoteRound(response.data);
}
