import { describe, expect, it } from 'vitest';
import {
  buildSpendablePointUpdate,
  getGameAwardedPoints,
  normalizeGamificationCategory,
  normalizeMarketItemKind,
} from './gamification';

describe('gamification service helpers', () => {
  it('normalizes supported leaderboard and ledger categories', () => {
    expect(normalizeGamificationCategory('listening')).toBe('listening');
    expect(normalizeGamificationCategory('events')).toBe('events');
    expect(normalizeGamificationCategory('games')).toBe('games');
    expect(normalizeGamificationCategory('social')).toBe('social');
    expect(normalizeGamificationCategory('jukebox')).toBe('jukebox');
    expect(normalizeGamificationCategory('unknown')).toBe('total');
    expect(normalizeGamificationCategory(undefined)).toBe('total');
  });

  it('normalizes market item kinds for digital and physical rewards', () => {
    expect(normalizeMarketItemKind('badge')).toBe('badge');
    expect(normalizeMarketItemKind('digital')).toBe('digital');
    expect(normalizeMarketItemKind('physical')).toBe('physical');
    expect(normalizeMarketItemKind('coupon')).toBe('coupon');
    expect(normalizeMarketItemKind('invalid')).toBe('digital');
  });

  it('caps arcade game awards by configured daily point limit', () => {
    expect(getGameAwardedPoints({ score: 90, pointRate: 0.5, dailyLimit: 30 })).toBe(30);
    expect(getGameAwardedPoints({ score: 12, pointRate: 0.5, dailyLimit: 30 })).toBe(6);
    expect(getGameAwardedPoints({ score: -10, pointRate: 2, dailyLimit: 30 })).toBe(0);
  });

  it('builds a spendable point update without touching lifetime rank totals', () => {
    expect(buildSpendablePointUpdate(120, 45)).toEqual({
      nextSpendablePoints: 75,
      canRedeem: true,
    });
    expect(buildSpendablePointUpdate(20, 45)).toEqual({
      nextSpendablePoints: 20,
      canRedeem: false,
    });
  });
});
