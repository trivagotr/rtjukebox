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

/**
 * The games that ship inside the mobile app. These are always listed in the
 * Games screen (even when the backend arcade-games registry is empty), and are
 * enriched with the server record — real id + daily point limit — whenever a
 * matching slug exists on the backend.
 */
export interface BuiltinGame {
  slug: string;
  title: string;
  description: string;
  daily_point_limit: number;
}

export const BUILTIN_GAMES: BuiltinGame[] = [
  {
    slug: 'snake',
    title: 'Yılan',
    description: 'Klasik yılan oyunu — büyüdükçe hızlanır.',
    daily_point_limit: 100,
  },
  {
    slug: 'memory',
    title: 'Hafıza',
    description: 'Kartları eşleştir, hafızanı test et.',
    daily_point_limit: 100,
  },
  {
    slug: 'tetris',
    title: 'Bloklar',
    description: 'Düşen blokları diz, satırları temizle.',
    daily_point_limit: 100,
  },
  {
    slug: 'rhythm-tap',
    title: 'Ritim',
    description: 'Ritme göre doğru zamanda dokun.',
    daily_point_limit: 100,
  },
  {
    slug: 'word-guess',
    title: 'Kelime Tahmini',
    description: 'İpuçlarıyla gizli kelimeyi bul.',
    daily_point_limit: 100,
  },
];
