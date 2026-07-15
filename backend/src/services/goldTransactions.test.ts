import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
    pool: {connect: mocks.connect},
  },
}));

import {awardUserPoints, spendUserPoints} from './gamification';

function sqlText(input: unknown) {
  return String(input).replace(/\s+/g, ' ').trim();
}

describe('Gold transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({query: mocks.query, release: mocks.release});
  });

  it('awards Gold once for an account idempotency key', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.startsWith('INSERT INTO points_ledger')) {
        return {rows: [{id: 'ledger-1'}]};
      }
      if (text.startsWith('INSERT INTO user_points')) {
        return {rows: [{spendable_points: 110}]};
      }
      return {rows: []};
    });

    await expect(awardUserPoints({
      userId: 'user-1',
      amount: 10,
      category: 'games',
      sourceType: 'arcade_game',
      sourceId: 'round-1',
      idempotencyKey: 'game:round-1',
    })).resolves.toEqual({
      applied: true,
      amount: 10,
      awarded: 10,
      spendablePoints: 110,
      ledgerId: 'ledger-1',
    });

    const ledgerCall = mocks.query.mock.calls.find(([sql]) =>
      sqlText(sql).startsWith('INSERT INTO points_ledger'),
    );
    expect(ledgerCall?.[1]).toEqual(expect.arrayContaining([
      'user-1',
      10,
      'games',
      'arcade_game',
      'round-1',
      'game:round-1',
    ]));
    expect(mocks.query.mock.calls.map(([sql]) => sqlText(sql))).toContain('COMMIT');
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('replays an existing Gold award without changing the balance again', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.startsWith('INSERT INTO points_ledger')) {
        return {rows: []};
      }
      if (text.startsWith('SELECT id, amount, balance_after FROM points_ledger')) {
        return {rows: [{id: 'ledger-1', amount: 10, balance_after: 110}]};
      }
      return {rows: []};
    });

    await expect(awardUserPoints({
      userId: 'user-1',
      amount: 10,
      category: 'games',
      sourceType: 'arcade_game',
      sourceId: 'round-1',
      idempotencyKey: 'game:round-1',
    })).resolves.toEqual({
      applied: false,
      amount: 10,
      awarded: 10,
      spendablePoints: 110,
      ledgerId: 'ledger-1',
    });

    expect(mocks.query.mock.calls.some(([sql]) =>
      sqlText(sql).startsWith('INSERT INTO user_points'),
    )).toBe(false);
  });

  it('spends only spendable Gold and writes a negative ledger mutation', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.startsWith('INSERT INTO points_ledger')) {
        return {rows: [{id: 'ledger-spend-1'}]};
      }
      if (text.startsWith('SELECT spendable_points FROM user_points')) {
        return {rows: [{spendable_points: 100}]};
      }
      if (text.startsWith('UPDATE user_points SET spendable_points')) {
        return {rows: [{spendable_points: 60}]};
      }
      return {rows: []};
    });

    await expect(spendUserPoints({
      userId: 'user-1',
      amount: 40,
      category: 'study',
      sourceType: 'avatar_purchase',
      sourceId: 'bucket-hat',
      idempotencyKey: 'avatar:purchase-1',
    })).resolves.toEqual({
      applied: true,
      amount: -40,
      awarded: 0,
      spendablePoints: 60,
      ledgerId: 'ledger-spend-1',
    });

    const ledgerCall = mocks.query.mock.calls.find(([sql]) =>
      sqlText(sql).startsWith('INSERT INTO points_ledger'),
    );
    expect(ledgerCall?.[1]).toEqual(expect.arrayContaining(['user-1', -40]));
  });

  it('rolls back a spend that would make Gold negative', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.startsWith('INSERT INTO points_ledger')) {
        return {rows: [{id: 'ledger-spend-2'}]};
      }
      if (text.startsWith('SELECT spendable_points FROM user_points')) {
        return {rows: [{spendable_points: 20}]};
      }
      return {rows: []};
    });

    await expect(spendUserPoints({
      userId: 'user-1',
      amount: 21,
      category: 'market',
      sourceType: 'market_redemption',
      sourceId: 'reward-1',
      idempotencyKey: 'market:redeem-1',
    })).rejects.toThrow('INSUFFICIENT_GOLD');

    expect(mocks.query.mock.calls.map(([sql]) => sqlText(sql))).toContain('ROLLBACK');
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
