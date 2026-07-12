import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { NEXT_SONG_VOTE_API, STORAGE_API } from './config';

export const NEXT_SONG_VOTE_ACTIVE_ROUND_PATH = '/next-song-voting/rounds/active';
export const NEXT_SONG_VOTE_CLIENT_ID_KEY = 'next_song_voting_client_id';

export function buildNextSongVotePath(roundId: string) {
  return `/next-song-voting/rounds/${roundId}/votes`;
}

export type NextSongVoteRoundStatus = 'open' | 'locked' | 'resolved' | 'cancelled';
export type NextSongVoteResolutionMode = 'user-vote' | 'tie-break' | 'no-vote-fallback' | null;

export interface NextSongVoteCandidate {
  id: string;
  songId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  votes: number;
}

export interface NextSongVoteRound {
  id: string;
  status: NextSongVoteRoundStatus;
  candidates: NextSongVoteCandidate[];
  userVoteCandidateId: string | null;
  winnerCandidateId?: string | null;
  resolutionMode?: NextSongVoteResolutionMode;
  lockAt?: string | null;
  resolveAt?: string | null;
}

interface NextSongVoteClientStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object');
}

function pickRoundEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.data) && 'round' in payload.data) {
    return payload.data.round;
  }

  if ('round' in payload) {
    return payload.round;
  }

  return payload;
}

function normalizeResolutionMode(value: unknown): NextSongVoteResolutionMode {
  return value === 'user-vote' || value === 'tie-break' || value === 'no-vote-fallback' ? value : null;
}

export function normalizeNextSongVoteRound(payload: unknown): NextSongVoteRound | null {
  const round = pickRoundEnvelope(payload);
  if (!isRecord(round) || typeof round.id !== 'string' || !Array.isArray(round.candidates)) {
    return null;
  }

  return {
    id: round.id,
    status: ['open', 'locked', 'resolved', 'cancelled'].includes(round.status) ? round.status : 'open',
    candidates: round.candidates
      .filter(isRecord)
      .map((candidate) => ({
        id: String(candidate.id),
        songId: String(candidate.songId ?? candidate.song_id ?? ''),
        title: String(candidate.title ?? ''),
        artist: String(candidate.artist ?? ''),
        albumArtUrl:
          typeof candidate.albumArtUrl === 'string'
            ? candidate.albumArtUrl
            : typeof candidate.album_art_url === 'string'
              ? candidate.album_art_url
              : null,
        votes: Number(candidate.votes ?? 0),
      })),
    userVoteCandidateId:
      typeof round.userVoteCandidateId === 'string'
        ? round.userVoteCandidateId
        : typeof round.user_vote_candidate_id === 'string'
          ? round.user_vote_candidate_id
          : null,
    winnerCandidateId:
      typeof round.winnerCandidateId === 'string'
        ? round.winnerCandidateId
        : typeof round.winner_candidate_id === 'string'
          ? round.winner_candidate_id
          : null,
    resolutionMode: normalizeResolutionMode(round.resolutionMode ?? round.resolution_mode),
    lockAt: typeof round.lockAt === 'string' ? round.lockAt : typeof round.lock_at === 'string' ? round.lock_at : null,
    resolveAt:
      typeof round.resolveAt === 'string' ? round.resolveAt : typeof round.resolve_at === 'string' ? round.resolve_at : null,
  };
}

export function buildNextSongVotePayload(candidateId: string, deviceId?: string | null) {
  return {
    candidateId,
    candidate_id: candidateId,
    ...(deviceId ? { device_id: deviceId } : {}),
  };
}

function createNextSongVoteClientId(random: () => number): string {
  return `nsv-${random().toString(36).slice(2, 13)}`;
}

async function getOrCreateNextSongVoteClientId(
  storage: NextSongVoteClientStorage,
  random: () => number,
): Promise<string> {
  const existing = await storage.getItem(NEXT_SONG_VOTE_CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextClientId = createNextSongVoteClientId(random);
  await storage.setItem(NEXT_SONG_VOTE_CLIENT_ID_KEY, nextClientId);
  return nextClientId;
}

export async function buildNextSongVoteRequestConfig(
  storage: NextSongVoteClientStorage = AsyncStorage,
  random: () => number = Math.random,
) {
  const accessToken = await storage.getItem('access_token');
  if (accessToken) {
    return {};
  }

  const clientId = await getOrCreateNextSongVoteClientId(storage, random);
  return {
    headers: {
      'x-client-id': clientId,
    },
  };
}

export function getCandidateCoverUrl(candidate: Pick<NextSongVoteCandidate, 'albumArtUrl'>, storageApi = STORAGE_API) {
  if (!candidate.albumArtUrl) {
    return null;
  }

  return candidate.albumArtUrl.startsWith('/') ? `${storageApi}${candidate.albumArtUrl}` : candidate.albumArtUrl;
}

export function getNextSongVoteStatusCopy(round: NextSongVoteRound | null): string {
  if (!round) {
    return 'Sıradaki oylama bekleniyor.';
  }

  if (round.status === 'open') {
    return 'Sıradaki şarkıyı seç.';
  }

  if (round.status === 'locked') {
    return 'Oylar kilitlendi.';
  }

  return 'Sıradaki şarkı hazır.';
}

export async function fetchActiveNextSongVoteRound(deviceId?: string | null): Promise<NextSongVoteRound | null> {
  const response = await api.get(NEXT_SONG_VOTE_ACTIVE_ROUND_PATH, {
    baseURL: NEXT_SONG_VOTE_API,
    params: deviceId ? { device_id: deviceId } : undefined,
    ...(await buildNextSongVoteRequestConfig()),
  });

  return normalizeNextSongVoteRound(response.data);
}

export async function submitNextSongVote(
  roundId: string,
  candidateId: string,
  deviceId?: string | null
): Promise<NextSongVoteRound | null> {
  const response = await api.post(
    buildNextSongVotePath(roundId),
    buildNextSongVotePayload(candidateId, deviceId),
    {
      baseURL: NEXT_SONG_VOTE_API,
      ...(await buildNextSongVoteRequestConfig()),
    },
  );

  return normalizeNextSongVoteRound(response.data);
}
