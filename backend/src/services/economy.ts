import type { PoolClient } from 'pg';
import { db } from '../db';
import {
    awardUserPoints,
    spendUserPoints,
    type GoldMutationResult,
    type LedgerCategory,
} from './gamification';

export type EconomyDirection = 'earn' | 'spend';

export type EconomyRule = {
    ruleKey: string;
    direction: EconomyDirection;
    amount: number;
    dailyCap: number | null;
    category: LedgerCategory;
    enabled: boolean;
    description: string;
    version: number;
};

type QueryClient = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

function numberValue(value: unknown, fallback = 0): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function mapRule(row: Record<string, unknown>): EconomyRule {
    return {
        ruleKey: String(row.rule_key),
        direction: row.direction === 'spend' ? 'spend' : 'earn',
        amount: Math.max(1, numberValue(row.amount, 1)),
        dailyCap: row.daily_cap == null ? null : Math.max(1, numberValue(row.daily_cap, 1)),
        category: String(row.category) as LedgerCategory,
        enabled: row.enabled !== false,
        description: String(row.description ?? ''),
        version: Math.max(1, numberValue(row.version, 1)),
    };
}

export async function getEconomyRule(ruleKey: string, client: QueryClient = db): Promise<EconomyRule> {
    const result = await client.query(
        `SELECT rule_key, direction, amount, daily_cap, category, enabled, description, version
         FROM gold_economy_rules
         WHERE rule_key = $1
         LIMIT 1`,
        [ruleKey],
    );
    if (!result.rows[0]) throw new Error('ECONOMY_RULE_NOT_FOUND');
    return mapRule(result.rows[0]);
}

export async function listEconomyRules(client: QueryClient = db): Promise<EconomyRule[]> {
    const result = await client.query(
        `SELECT rule_key, direction, amount, daily_cap, category, enabled, description, version
         FROM gold_economy_rules
         ORDER BY direction, rule_key`,
    );
    return result.rows.map(mapRule);
}

async function withEconomyTransaction<T>(
    providedClient: PoolClient | undefined,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const owned = providedClient ? null : await db.pool.connect();
    const client = providedClient ?? owned!;
    if (owned) await client.query('BEGIN');
    try {
        const result = await work(client);
        if (owned) await client.query('COMMIT');
        return result;
    } catch (error) {
        if (owned) await client.query('ROLLBACK');
        throw error;
    } finally {
        owned?.release();
    }
}

export async function getGoldBalance(userId: string, client: QueryClient = db): Promise<number> {
    const result = await client.query(
        'SELECT COALESCE(spendable_points, 0) AS balance FROM user_points WHERE user_id = $1',
        [userId],
    );
    return Math.max(0, numberValue(result.rows[0]?.balance));
}

export type EconomyRewardResult = GoldMutationResult & {
    rule: EconomyRule;
    dailyCapped: boolean;
};

export async function awardEconomyReward(
    params: {
        userId: string;
        ruleKey: string;
        sourceId: string;
        idempotencyKey: string;
        metadata?: Record<string, unknown>;
    },
    providedClient?: PoolClient,
): Promise<EconomyRewardResult> {
    return withEconomyTransaction(providedClient, async (client) => {
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [params.userId]);
        const rule = await getEconomyRule(params.ruleKey, client);
        if (rule.direction !== 'earn') throw new Error('ECONOMY_RULE_DIRECTION_INVALID');
        if (!rule.enabled) {
            return {
                applied: false,
                amount: 0,
                awarded: 0,
                spendablePoints: await getGoldBalance(params.userId, client),
                ledgerId: null,
                rule,
                dailyCapped: false,
            };
        }

        const existing = await client.query(
            `SELECT id, amount, category, source_type, source_id, balance_after
             FROM points_ledger
             WHERE user_id = $1 AND idempotency_key = $2
             LIMIT 1`,
            [params.userId, params.idempotencyKey],
        );
        if (existing.rows[0]) {
            const existingSourceId = existing.rows[0].source_id == null ? null : String(existing.rows[0].source_id);
            if (String(existing.rows[0].category ?? '') !== rule.category
                || String(existing.rows[0].source_type ?? '') !== `economy:${params.ruleKey}`
                || existingSourceId !== params.sourceId) {
                throw new Error('GOLD_IDEMPOTENCY_PAYLOAD_MISMATCH');
            }
            const amount = numberValue(existing.rows[0].amount);
            return {
                applied: false,
                amount,
                awarded: Math.max(0, amount),
                spendablePoints: Math.max(0, numberValue(existing.rows[0].balance_after)),
                ledgerId: String(existing.rows[0].id),
                rule,
                dailyCapped: false,
            };
        }

        let amount = rule.amount;
        let dailyCapped = false;
        if (rule.dailyCap != null) {
            const daily = await client.query(
                `SELECT COALESCE(SUM(amount), 0) AS awarded_today
                 FROM points_ledger
                 WHERE user_id = $1
                   AND source_type = $2
                   AND amount > 0
                   AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`,
                [params.userId, `economy:${params.ruleKey}`],
            );
            const remaining = Math.max(0, rule.dailyCap - numberValue(daily.rows[0]?.awarded_today));
            amount = Math.min(amount, remaining);
            dailyCapped = amount < rule.amount;
        }
        if (amount <= 0) {
            return {
                applied: false,
                amount: 0,
                awarded: 0,
                spendablePoints: await getGoldBalance(params.userId, client),
                ledgerId: null,
                rule,
                dailyCapped: true,
            };
        }

        const result = await awardUserPoints({
            userId: params.userId,
            amount,
            category: rule.category,
            sourceType: `economy:${params.ruleKey}`,
            sourceId: params.sourceId,
            idempotencyKey: params.idempotencyKey,
            metadata: { ...params.metadata, rule_key: rule.ruleKey, rule_version: rule.version },
        }, client);
        return { ...result, rule, dailyCapped };
    });
}

export async function spendEconomyCost(
    params: {
        userId: string;
        ruleKey: string;
        sourceId: string;
        idempotencyKey: string;
        metadata?: Record<string, unknown>;
    },
    providedClient?: PoolClient,
): Promise<GoldMutationResult & { rule: EconomyRule }> {
    return withEconomyTransaction(providedClient, async (client) => {
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [params.userId]);
        const rule = await getEconomyRule(params.ruleKey, client);
        if (rule.direction !== 'spend') throw new Error('ECONOMY_RULE_DIRECTION_INVALID');
        if (!rule.enabled) throw new Error('ECONOMY_RULE_DISABLED');
        const result = await spendUserPoints({
            userId: params.userId,
            amount: rule.amount,
            category: rule.category,
            sourceType: `economy:${params.ruleKey}`,
            sourceId: params.sourceId,
            idempotencyKey: params.idempotencyKey,
            metadata: { ...params.metadata, rule_key: rule.ruleKey, rule_version: rule.version },
        }, client);
        return { ...result, rule };
    });
}

export async function tryAwardFirstLogin(userId: string, channel: 'web' | 'mobile' | 'erp') {
    try {
        return await awardEconomyReward({
            userId,
            ruleKey: 'first_login',
            sourceId: userId,
            idempotencyKey: `economy:first-login:${userId}`,
            metadata: { channel },
        });
    } catch (error) {
        console.error('First-login Gold reward failed:', error);
        return null;
    }
}

export async function adminAdjustGold(params: {
    userId: string;
    amount: number;
    requestId: string;
    adminIdentifier: string;
    reason: string;
}, providedClient?: PoolClient): Promise<GoldMutationResult> {
    const amount = Math.trunc(params.amount);
    if (!amount || Math.abs(amount) > 10000) throw new Error('INVALID_GOLD_AMOUNT');
    const idempotencyKey = `gold-admin:${params.requestId}`;
    if (amount > 0) {
        return awardUserPoints({
            userId: params.userId,
            amount,
            category: 'social',
            sourceType: 'admin_adjustment',
            sourceId: params.requestId,
            idempotencyKey,
            metadata: { admin_identifier: params.adminIdentifier, reason: params.reason },
        }, providedClient);
    }
    return spendUserPoints({
        userId: params.userId,
        amount: Math.abs(amount),
        category: 'social',
        sourceType: 'admin_adjustment',
        sourceId: params.requestId,
        idempotencyKey,
        metadata: { admin_identifier: params.adminIdentifier, reason: params.reason },
    }, providedClient);
}
