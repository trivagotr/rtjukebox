import { db } from '../db';
import { getIstanbulYearMonth } from './jukeboxScoring';

export type GamificationCategory = 'total' | 'listening' | 'events' | 'games' | 'social' | 'jukebox';
export type LedgerCategory = Exclude<GamificationCategory, 'total'>;
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

export interface AwardUserPointsParams {
    userId: string;
    amount: number;
    category: LedgerCategory;
    sourceType: string;
    sourceId?: string | null;
    metadata?: Record<string, unknown> | null;
}

export async function awardUserPoints(params: AwardUserPointsParams) {
    const amount = Math.floor(params.amount);
    if (!params.userId || amount <= 0) {
        return { awarded: 0 };
    }

    const category = normalizeLedgerCategory(params.category);
    const categoryColumn = `${category}_points`;
    const yearMonth = getIstanbulYearMonth(new Date());
    const metadata = params.metadata ?? {};

    await db.query('BEGIN');
    try {
        await db.query(
            `INSERT INTO user_points (user_id, lifetime_points, spendable_points, monthly_points, ${categoryColumn}, updated_at)
             VALUES ($1, $2, $2, $2, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                lifetime_points = user_points.lifetime_points + EXCLUDED.lifetime_points,
                spendable_points = user_points.spendable_points + EXCLUDED.spendable_points,
                monthly_points = user_points.monthly_points + EXCLUDED.monthly_points,
                ${categoryColumn} = user_points.${categoryColumn} + EXCLUDED.${categoryColumn},
                updated_at = NOW()`,
            [params.userId, amount],
        );

        await db.query(
            `INSERT INTO points_ledger (user_id, amount, category, source_type, source_id, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [params.userId, amount, category, params.sourceType, params.sourceId ?? null, JSON.stringify(metadata)],
        );

        await db.query(
            'UPDATE users SET rank_score = COALESCE(rank_score, 0) + $1, updated_at = NOW() WHERE id = $2 AND is_guest = false',
            [amount, params.userId],
        );

        await db.query(
            `INSERT INTO user_monthly_rank_scores (user_id, year_month, score, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, year_month) DO UPDATE SET
                score = user_monthly_rank_scores.score + EXCLUDED.score,
                updated_at = NOW()`,
            [params.userId, yearMonth, amount],
        );

        await db.query('COMMIT');
        return { awarded: amount };
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
}
