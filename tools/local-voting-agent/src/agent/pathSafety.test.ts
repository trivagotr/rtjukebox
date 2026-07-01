import { describe, expect, it } from 'vitest';
import { isPathInsideRoots } from './pathSafety';

describe('path safety', () => {
  it('accepts files inside configured roots', () => {
    expect(isPathInsideRoots('C:/Music/song.mp3', ['C:/Music'])).toBe(true);
    expect(isPathInsideRoots('D:/Radio/Set/song.mp3', ['C:/Music', 'D:/Radio'])).toBe(true);
  });

  it('rejects files outside configured roots', () => {
    expect(isPathInsideRoots('C:/Windows/secret.mp3', ['C:/Music'])).toBe(false);
  });

  it('rejects sibling paths with similar prefixes', () => {
    expect(isPathInsideRoots('C:/MusicBackup/song.mp3', ['C:/Music'])).toBe(false);
  });
});
