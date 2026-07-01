import { describe, expect, it } from 'vitest';
import { loadAgentConfig, normalizeCandidateCount } from './config';

describe('agent config', () => {
  it('defaults candidate count to 3', () => {
    expect(normalizeCandidateCount(undefined)).toBe(3);
  });

  it('accepts only 2 or 3 candidates', () => {
    expect(normalizeCandidateCount('2')).toBe(2);
    expect(normalizeCandidateCount(3)).toBe(3);
    expect(normalizeCandidateCount('9')).toBe(3);
  });

  it('loads dry-run playback by default', () => {
    const config = loadAgentConfig({
      LOCAL_SONG_CATALOG: 'data/songs.sample.json',
      MUSIC_ROOTS: 'C:/Music;D:/Radio',
    });

    expect(config.playbackMode).toBe('dry-run');
    expect(config.musicRoots).toEqual(['C:/Music', 'D:/Radio']);
    expect(config.candidateCount).toBe(3);
  });

  it('defaults music roots to the sample catalog root', () => {
    expect(loadAgentConfig({}).musicRoots).toEqual(['C:/Music']);
  });

  it('loads folder database, jingle, and backend client settings from env', () => {
    const config = loadAgentConfig({
      MUSIC_LIBRARY_DIR: 'D:/Radio/Music',
      JINGLE_LIBRARY_DIR: 'D:/Radio/Jingles',
      JINGLE_BEFORE_WINNER: 'true',
      BACKEND_API_BASE_URL: 'https://rt.example.test',
      BACKEND_AGENT_TOKEN: 'secret-token',
      BACKEND_DEVICE_ID: 'studio-pc',
    });

    expect(config.musicRoots).toEqual(['D:/Radio/Music']);
    expect(config.jingleRoots).toEqual(['D:/Radio/Jingles']);
    expect(config.jingleBeforeWinner).toBe(true);
    expect(config.backend).toEqual({
      apiBaseUrl: 'https://rt.example.test',
      agentToken: 'secret-token',
      deviceId: 'studio-pc',
      enabled: true,
    });
  });
});
