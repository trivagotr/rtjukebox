import { buildPlaybackArgs } from './ffmpeg';
import type { JingleTrack, PlaybackMode, PlaybackPlan, PlaybackPlanEntry, VotingCandidate } from './types';

interface BuildWinnerPlaybackPlanInput {
  winner: VotingCandidate;
  jingles: JingleTrack[];
  playbackMode: PlaybackMode;
  jingleBeforeWinner: boolean;
  rng?: () => number;
}

function takeRandomIndex(length: number, rng: () => number): number {
  if (length <= 1) {
    return 0;
  }

  return Math.min(length - 1, Math.floor(rng() * length));
}

function toEntry(kind: PlaybackPlanEntry['kind'], title: string, filePath: string): PlaybackPlanEntry {
  return {
    kind,
    title,
    filePath,
    ffmpegArgs: buildPlaybackArgs(filePath),
  };
}

export function buildWinnerPlaybackPlan(input: BuildWinnerPlaybackPlanInput): PlaybackPlan {
  const rng = input.rng ?? Math.random;
  const entries: PlaybackPlanEntry[] = [];
  const enabledJingles = input.jingles.filter((jingle) => jingle.enabled !== false);

  if (input.jingleBeforeWinner && enabledJingles.length > 0) {
    const jingle = enabledJingles[takeRandomIndex(enabledJingles.length, rng)];
    entries.push(toEntry('jingle', jingle.title, jingle.filePath));
  }

  entries.push(toEntry('winner', input.winner.title, input.winner.filePath));

  return {
    mode: input.playbackMode,
    entries,
  };
}
