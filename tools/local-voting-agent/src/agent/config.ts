import type { AgentConfig, CandidateCount, PlaybackMode } from './types';

const DEFAULT_CATALOG_PATH = 'data/songs.sample.json';
const DEFAULT_ART_CACHE_DIR = 'var/album-art';
const DEFAULT_MUSIC_ROOTS = ['C:/Music'];
const DEFAULT_SERVER_PORT = 4317;

export function normalizeCandidateCount(value: unknown): CandidateCount {
  return Number(value) === 2 ? 2 : 3;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePlaybackMode(value: string | undefined): PlaybackMode {
  return value === 'live' ? 'live' : 'dry-run';
}

function normalizePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SERVER_PORT;
}

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    candidateCount: normalizeCandidateCount(env.CANDIDATE_COUNT),
    catalogPath: env.LOCAL_SONG_CATALOG?.trim() || DEFAULT_CATALOG_PATH,
    musicRoots: splitList(env.MUSIC_ROOTS).length > 0 ? splitList(env.MUSIC_ROOTS) : DEFAULT_MUSIC_ROOTS,
    artCacheDir: env.ALBUM_ART_CACHE_DIR?.trim() || DEFAULT_ART_CACHE_DIR,
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    ffprobePath: env.FFPROBE_PATH?.trim() || 'ffprobe',
    playbackMode: normalizePlaybackMode(env.VOTING_AGENT_PLAYBACK_MODE),
    serverPort: normalizePort(env.PORT),
  };
}
