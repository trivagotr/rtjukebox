export type GameRouteName =
  | 'SnakeGame'
  | 'MemoryGame'
  | 'TetrisGame'
  | 'RhythmTapGame'
  | 'WordGuessGame';

const GAME_ROUTE_BY_SLUG: Record<string, GameRouteName> = {
  snake: 'SnakeGame',
  memory: 'MemoryGame',
  tetris: 'TetrisGame',
  'rhythm-tap': 'RhythmTapGame',
  'word-guess': 'WordGuessGame',
};

export function getGameRouteForSlug(slug?: string | null): GameRouteName | null {
  if (!slug) {
    return null;
  }

  return GAME_ROUTE_BY_SLUG[slug.trim().toLowerCase()] ?? null;
}
