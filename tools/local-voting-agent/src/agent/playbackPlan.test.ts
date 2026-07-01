import { describe, expect, it } from 'vitest';
import { buildWinnerPlaybackPlan } from './playbackPlan';
import type { JingleTrack, VotingCandidate } from './types';

const winner: VotingCandidate = {
  id: 'candidate-song-1',
  songId: 'song-1',
  title: 'Winner',
  artist: 'Artist',
  filePath: 'C:/Music/winner.mp3',
  albumArtUrl: null,
  votes: 3,
};

const jingles: JingleTrack[] = [
  {
    id: 'jingle-1',
    title: 'Station ID',
    filePath: 'C:/Jingles/station-id.wav',
    enabled: true,
  },
];

describe('playback plan', () => {
  it('builds a dry-run FFmpeg plan with a jingle before the winning song', () => {
    const plan = buildWinnerPlaybackPlan({
      winner,
      jingles,
      playbackMode: 'dry-run',
      jingleBeforeWinner: true,
      rng: () => 0,
    });

    expect(plan).toEqual({
      mode: 'dry-run',
      entries: [
        {
          kind: 'jingle',
          title: 'Station ID',
          filePath: 'C:/Jingles/station-id.wav',
          ffmpegArgs: ['-hide_banner', '-nostdin', '-re', '-i', 'C:/Jingles/station-id.wav', '-f', 'null', '-'],
        },
        {
          kind: 'winner',
          title: 'Winner',
          filePath: 'C:/Music/winner.mp3',
          ffmpegArgs: ['-hide_banner', '-nostdin', '-re', '-i', 'C:/Music/winner.mp3', '-f', 'null', '-'],
        },
      ],
    });
  });

  it('omits jingles when the jingle-before-winner switch is disabled', () => {
    const plan = buildWinnerPlaybackPlan({
      winner,
      jingles,
      playbackMode: 'live',
      jingleBeforeWinner: false,
      rng: () => 0,
    });

    expect(plan.entries.map((entry) => entry.kind)).toEqual(['winner']);
    expect(plan.mode).toBe('live');
  });
});
