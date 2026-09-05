import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, connect, release, awardUserPoints, spendUserPoints } = vi.hoisted(() => {
    const queryMock = vi.fn();
    return {
        query: queryMock,
        connect: vi.fn().mockResolvedValue({ query: queryMock, release: vi.fn() }),
        release: vi.fn(),
        awardUserPoints: vi.fn(),
        spendUserPoints: vi.fn(),
    };
});

vi.mock('../db', () => ({ db: { query, pool: { connect } } }));
vi.mock('./gamification', () => ({ awardUserPoints, spendUserPoints }));

import { adminAdjustGold, awardEconomyReward, spendEconomyCost } from './economy';

const earnRule = {
    rule_key: 'radio_hour', direction: 'earn', amount: 20, daily_cap: 40,
    category: 'listening', enabled: true, description: 'Verified hour', version: 2,
};
const spendRule = {
    rule_key: 'ai_message', direction: 'spend', amount: 5, daily_cap: null,
    category: 'social', enabled: true, description: 'RTAI message', version: 1,
};

describe('shared Gold economy service', () => {
    beforeEach(() => {
        query.mockReset();
        connect.mockClear();
        awardUserPoints.mockReset();
        spendUserPoints.mockReset();
    });

    it('uses a server rule and clips an award to the remaining daily cap', async () => {
        query.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
            if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 'user-1' }] };
            if (sql.includes('FROM gold_economy_rules')) return { rows: [earnRule] };
            if (sql.includes('idempotency_key = $2')) return { rows: [] };
            if (sql.includes('awarded_today')) return { rows: [{ awarded_today: 30 }] };
            throw new Error(`Unexpected query: ${sql}`);
        });
        awardUserPoints.mockResolvedValue({
            applied: true, amount: 10, awarded: 10, spendablePoints: 110, ledgerId: 'ledger-1',
        });

        const result = await awardEconomyReward({
            userId: 'user-1', ruleKey: 'radio_hour', sourceId: 'session-1',
            idempotencyKey: 'economy:radio-hour:user-1:1',
        });

        expect(result.dailyCapped).toBe(true);
        expect(result.awarded).toBe(10);
        expect(awardUserPoints).toHaveBeenCalledWith(expect.objectContaining({
            amount: 10,
            sourceType: 'economy:radio_hour',
            category: 'listening',
        }), expect.objectContaining({ query }));
    });

    it('returns an existing ledger result without minting Gold twice', async () => {
        query.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
            if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 'user-1' }] };
            if (sql.includes('FROM gold_economy_rules')) return { rows: [earnRule] };
            if (sql.includes('idempotency_key = $2')) {
                return {
                    rows: [{
                        id: 'ledger-existing',
                        amount: 20,
                        category: 'listening',
                        source_type: 'economy:radio_hour',
                        source_id: 'session-1',
                        balance_after: 80,
                    }],
                };
            }
            throw new Error(`Unexpected query: ${sql}`);
        });

        const result = await awardEconomyReward({
            userId: 'user-1', ruleKey: 'radio_hour', sourceId: 'session-1',
            idempotencyKey: 'economy:radio-hour:user-1:1',
        });

        expect(result).toMatchObject({ applied: false, ledgerId: 'ledger-existing', spendablePoints: 80 });
        expect(awardUserPoints).not.toHaveBeenCalled();
    });

    it('ignores client pricing and spends the configured RTAI message cost', async () => {
        query.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
            if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 'user-1' }] };
            if (sql.includes('FROM gold_economy_rules')) return { rows: [spendRule] };
            throw new Error(`Unexpected query: ${sql}`);
        });
        spendUserPoints.mockResolvedValue({
            applied: true, amount: -5, awarded: 0, spendablePoints: 45, ledgerId: 'ledger-2',
        });

        const result = await spendEconomyCost({
            userId: 'user-1', ruleKey: 'ai_message', sourceId: 'message-1',
            idempotencyKey: 'economy:ai-message:request-1',
        });

        expect(result.rule.amount).toBe(5);
        expect(spendUserPoints).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }), expect.objectContaining({ query }));
    });

    it('records negative administrator changes as spends and never permits a client balance', async () => {
        const client: any = { query };
        spendUserPoints.mockResolvedValue({
            applied: true, amount: -10, awarded: 0, spendablePoints: 30, ledgerId: 'ledger-admin',
        });
        const result = await adminAdjustGold({
            userId: 'user-1', amount: -10, requestId: 'request-1',
            adminIdentifier: 'internal-admin', reason: 'Verified manual correction',
        }, client);
        expect(result.spendablePoints).toBe(30);
        expect(spendUserPoints).toHaveBeenCalledWith(expect.objectContaining({
            amount: 10,
            sourceType: 'admin_adjustment',
            idempotencyKey: 'gold-admin:request-1',
        }), client);
    });
});
