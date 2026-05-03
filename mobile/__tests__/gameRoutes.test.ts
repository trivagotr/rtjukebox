import {describe, expect, it} from '@jest/globals';

import {getGameRouteForSlug} from '../src/screens/games/gameRoutes';

describe('game route mapping', () => {
  it('maps backend game slugs to native game screens', () => {
    expect(getGameRouteForSlug('snake')).toBe('SnakeGame');
    expect(getGameRouteForSlug('memory')).toBe('MemoryGame');
    expect(getGameRouteForSlug('tetris')).toBe('TetrisGame');
    expect(getGameRouteForSlug('rhythm-tap')).toBe('RhythmTapGame');
    expect(getGameRouteForSlug('word-guess')).toBe('WordGuessGame');
  });

  it('rejects unknown slugs instead of submitting demo scores', () => {
    expect(getGameRouteForSlug(undefined)).toBeNull();
    expect(getGameRouteForSlug('demo')).toBeNull();
  });
});
