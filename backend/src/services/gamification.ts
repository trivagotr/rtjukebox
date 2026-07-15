import { db } from '../db';
import type { PoolClient } from 'pg';
import { getIstanbulYearMonth } from './jukeboxScoring';

export type GamificationCategory = 'total' | 'listening' | 'events' | 'games' | 'social' | 'jukebox';
export type LedgerCategory = Exclude<GamificationCategory, 'total'>;
export type GoldLedgerCategory = LedgerCategory | 'market' | 'study';
export type MarketItemKind = 'digital' | 'physical' | 'coupon' | 'badge';

const LEDGER_CATEGORIES: LedgerCategory[] = ['listening', 'events', 'games', 'social', 'jukebox'];
const MARKET_ITEM_KINDS: MarketItemKind[] = ['digital', 'physical', 'coupon', 'badge'];

export function normalizeGamificationCategory(value: unknown): GamificationCategory {
    return LEDGER_CATEGORIES.includes(value as LedgerCategory) ? value as LedgerCategory : 'total';
}

export function normalizeLedgerCategory(value: unknown): LedgerCategory {
    const category = normalizeGamificationCategory(value);
    return category === 'total' ? 'social' : category;
}

export function normalizeMarketItemKind(value: unknown): MarketItemKind {
    return MARKET_ITEM_KINDS.includes(value as MarketItemKind) ? value as MarketItemKind : 'digital';
}

export function getGameAwardedPoints(params: { score: number; pointRate: number; dailyLimit: number }) {
    const score = Number.isFinite(params.score) ? params.score : 0;
    const pointRate = Number.isFinite(params.pointRate) ? params.pointRate : 0;
    const dailyLimit = Number.isFinite(params.dailyLimit) ? params.dailyLimit : 0;
    const calculated = Math.floor(score * pointRate);

    return Math.max(0, Math.min(calculated, dailyLimit));
}

export function buildSpendablePointUpdate(spendablePoints: number, cost: number) {
    const normalizedSpendable = Math.max(0, Math.floor(spendablePoints));
    const normalizedCost = Math.max(0, Math.floor(cost));
    const canRedeem = normalizedSpendable >= normalizedCost;

    return {
        nextSpendablePoints: canRedeem ? normalizedSpendable - normalizedCost : normalizedSpendable,
        canRedeem,
    };
}

export function normalizeGoldIdempotencyKey(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().slice(0, 180);
    return normalized || null;
}

export interface GoldMutationResult {
    applied: boolean;
    amount: number;
    awarded: number;
    spendablePoints: number;
    ledgerId: string | null;
}

export interface AwardUserPointsParams {
    userId: string;
    amount: number;
    category: LedgerCategory;
    sourceType: string;
    sourceId?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface SpendUserPointsParams {
    userId: string;
    amount: number;
    category: GoldLedgerCategory;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
}

type GoldQueryClient = Pick<PoolClient, 'query'>;

interface LedgerClaim {
    applied: boolean;
    ledgerId: string;
    amount: number;
    balanceAfter: number | null;
}

function toInteger(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

async function runGoldTransaction<T>(
    providedClient: GoldQueryClient | undefined,
    work: (client: GoldQueryClient) => Promise<T>,
): Promise<T> {
    const ownedClient = providedClient ? null : await db.pool.connect();
    const client = providedClient ?? ownedClient!;

    if (ownedClient) {
        await client.query('BEGIN');
    }

    try {
        const result = await work(client);
        if (ownedClient) {
            await client.query('COMMIT');
        }
        return result;
    } catch (error) {
        if (ownedClient) {
            await client.query('ROLLBACK');
        }
        throw error;
    } finally {
        ownedClient?.release();
    }
}

async function claimLedgerEntry(
    client: GoldQueryClient,
    params: {
        userId: string;
        amount: number;
        category: GoldLedgerCategory;
        sourceType: string;
        sourceId: string | null;
        idempotencyKey: string | null;
        metadata: Record<string, unknown>;
    },
): Promise<LedgerClaim> {
    const inserted = await client.query(
        `INSERT INTO points_ledger (
            user_id, amount, category, source_type, source_id,
            idempotency_key, balance_after, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
         ON CONFLICT (user_id, idempotency_key)
         WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
            params.userId,
            params.amount,
            params.category,
            params.sourceType,
            params.sourceId,
            params.idempotencyKey,
            JSON.stringify(params.metadata),
        ],
    );

    if (inserted.rows[0]?.id) {
        return {
            applied: true,
            ledgerId: String(inserted.rows[0].id),
            amount: params.amount,
            balanceAfter: null,
        };
    }

    if (!params.idempotencyKey) {
        throw new Error('GOLD_LEDGER_INSERT_FAILED');
    }

    const existing = await client.query(
        `SELECT id, amount, balance_after FROM points_ledger
         WHERE user_id = $1 AND idempotency_key = $2`,
        [params.userId, params.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row?.id) {
        throw new Error('GOLD_IDEMPOTENCY_REPLAY_MISSING');
    }

    return {
        applied: false,
        ledgerId: String(row.id),
        amount: toInteger(row.amount),
        balanceAfter: toInteger(row.balance_after),
    };
}

async function finishLedgerEntry(
    client: GoldQueryClient,
    ledgerId: string,
    balanceAfter: number,
) {
    await client.query(
        'UPDATE points_ledger SET balance_after = $1 WHERE id = $2',
        [balanceAfter, ledgerId],
    );
}

export async function awardUserPoints(
    params: AwardUserPointsParams,
    providedClient?: GoldQueryClient,
): Promise<GoldMutationResult> {
    const amount = Math.floor(params.amount);
    if (!params.userId || amount <= 0) {
        return {
            applied: false,
            amount: 0,
            awarded: 0,
            spendablePoints: 0,
            ledgerId: null,
        };
    }

    const category = normalizeLedgerCategory(params.category);
    const categoryColumn = `${category}_points`;
    const yearMonth = getIstanbulYearMonth(new Date());
    const metadata = params.metadata ?? {};
    const idempotencyKey = normalizeGoldIdempotencyKey(params.idempotencyKey);

    return runGoldTransaction(providedClient, async (client) => {
        const ledger = await claimLedgerEntry(client, {
            userId: params.userId,
            amount,
            category,
            sourceType: params.sourceType,
            sourceId: params.sourceId ?? null,
            idempotencyKey,
            metadata,
        });

        if (!ledger.applied) {
            return {
                applied: false,
                amount: ledger.amount,
                awarded: Math.max(0, ledger.amount),
                spendablePoints: ledger.balanceAfter ?? 0,
                ledgerId: ledger.ledgerId,
            };
        }

        const pointsResult = await client.query(
            `INSERT INTO user_points (user_id, lifetime_points, spendable_points, monthly_points, ${categoryColumn}, updated_at)
             VALUES ($1, $2, $2, $2, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                lifetime_points = user_points.lifetime_points + EXCLUDED.lifetime_points,
                spendable_points = user_points.spendable_points + EXCLUDED.spendable_points,
                monthly_points = user_points.monthly_points + EXCLUDED.monthly_points,
                ${categoryColumn} = user_points.${categoryColumn} + EXCLUDED.${categoryColumn},
                updated_at = NOW()
             RETURNING spendable_points`,
            [params.userId, amount],
        );
        const spendablePoints = toInteger(pointsResult.rows[0]?.spendable_points);
        await finishLedgerEntry(client, ledger.ledgerId, spendablePoints);

        await client.query(
            'UPDATE users SET rank_score = COALESCE(rank_score, 0) + $1, updated_at = NOW() WHERE id = $2 AND is_guest = false',
            [amount, params.userId],
        );

        await client.query(
            `INSERT INTO user_monthly_rank_scores (user_id, year_month, score, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, year_month) DO UPDATE SET
                score = user_monthly_rank_scores.score + EXCLUDED.score,
                updated_at = NOW()`,
            [params.userId, yearMonth, amount],
        );

        return {
            applied: true,
            amount,
            awarded: amount,
            spendablePoints,
            ledgerId: ledger.ledgerId,
        };
    });
}

export async function spendUserPoints(
    params: SpendUserPointsParams,
    providedClient?: GoldQueryClient,
): Promise<GoldMutationResult> {
    const amount = Math.floor(params.amount);
    if (!params.userId || amount <= 0) {
        throw new Error('INVALID_GOLD_AMOUNT');
    }

    const idempotencyKey = normalizeGoldIdempotencyKey(params.idempotencyKey);
    if (!idempotencyKey) {
        throw new Error('GOLD_IDEMPOTENCY_KEY_REQUIRED');
    }

    return runGoldTransaction(providedClient, async (client) => {
        const ledger = await claimLedgerEntry(client, {
            userId: params.userId,
            amount: -amount,
            category: params.category,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            idempotencyKey,
            metadata: params.metadata ?? {},
        });

        if (!ledger.applied) {
            return {
                applied: false,
                amount: ledger.amount,
                awarded: 0,
                spendablePoints: ledger.balanceAfter ?? 0,
                ledgerId: ledger.ledgerId,
            };
        }

        await client.query(
            `INSERT INTO user_points (user_id, updated_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id) DO NOTHING`,
            [params.userId],
        );
        const locked = await client.query(
            `SELECT spendable_points FROM user_points
             WHERE user_id = $1 FOR UPDATE`,
            [params.userId],
        );
        const currentBalance = toInteger(locked.rows[0]?.spendable_points);
        if (currentBalance < amount) {
            throw new Error('INSUFFICIENT_GOLD');
        }

        const updated = await client.query(
            `UPDATE user_points SET spendable_points = spendable_points - $1, updated_at = NOW()
             WHERE user_id = $2
             RETURNING spendable_points`,
            [amount, params.userId],
        );
        const spendablePoints = toInteger(updated.rows[0]?.spendable_points);
        await finishLedgerEntry(client, ledger.ledgerId, spendablePoints);

        return {
            applied: true,
            amount: -amount,
            awarded: 0,
            spendablePoints,
            ledgerId: ledger.ledgerId,
        };
    });
}
