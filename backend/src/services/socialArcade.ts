import crypto from 'crypto';

export const POOL_DIVE_TOTAL_ROUNDS = 8;
export const POOL_DIVE_MIN_RESPONSE_MS = 140;
export const POOL_DIVE_MAX_RESPONSE_MS = 4_000;
export const POOL_DIVE_SESSION_TTL_MS = 2 * 60_000;
export const POOL_DIVE_CHOICES = ['left', 'center', 'right'] as const;

export type PoolDiveChoice = typeof POOL_DIVE_CHOICES[number];

export interface PoolDiveState {
    version: 1;
    completedRounds: number;
    score: number;
    prompt: PoolDiveChoice;
    promptStartedAt: string;
    lastNonceHash?: string;
    lastResponse?: Record<string, unknown>;
}

export function isPoolDiveChoice(value: unknown): value is PoolDiveChoice {
    return typeof value === 'string' && POOL_DIVE_CHOICES.includes(value as PoolDiveChoice);
}

export function hashArcadeNonce(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function deriveArcadeNonce(
    secret: string,
    sessionId: string,
    clientRoundId: string,
    completedRounds: number,
) {
    if (secret.length < 32) throw new Error('SOCIAL_ARCADE_SECRET_UNAVAILABLE');
    const subkey = crypto.hkdfSync(
        'sha256',
        Buffer.from(secret),
        Buffer.alloc(0),
        Buffer.from('RadioTEDU Social Arcade nonce v1'),
        32,
    );
    return crypto.createHmac('sha256', Buffer.from(subkey))
        .update(`${sessionId}\n${clientRoundId}\n${completedRounds}`)
        .digest('base64url');
}

export function nonceHashesMatch(left: string, right: string) {
    if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function choosePoolDivePrompt(
    previous?: PoolDiveChoice,
    randomIndex: (maxExclusive: number) => number = (maxExclusive) => crypto.randomInt(maxExclusive),
): PoolDiveChoice {
    const options = previous
        ? POOL_DIVE_CHOICES.filter((choice) => choice !== previous)
        : [...POOL_DIVE_CHOICES];
    const index = Math.max(0, Math.min(options.length - 1, Math.floor(randomIndex(options.length))));
    return options[index]!;
}

export function createPoolDiveState(now: Date, prompt = choosePoolDivePrompt()): PoolDiveState {
    return {
        version: 1,
        completedRounds: 0,
        score: 0,
        prompt,
        promptStartedAt: now.toISOString(),
    };
}

export function normalizePoolDiveState(value: unknown): PoolDiveState | null {
    const state = typeof value === 'string' ? (() => {
        try {
            return JSON.parse(value) as unknown;
        } catch {
            return null;
        }
    })() : value;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    const row = state as Record<string, unknown>;
    const completedRounds = Number(row.completedRounds);
    const score = Number(row.score);
    if (
        row.version !== 1
        || !Number.isInteger(completedRounds) || completedRounds < 0 || completedRounds > POOL_DIVE_TOTAL_ROUNDS
        || !Number.isInteger(score) || score < 0 || score > POOL_DIVE_TOTAL_ROUNDS * 100
        || !isPoolDiveChoice(row.prompt)
        || typeof row.promptStartedAt !== 'string'
        || !Number.isFinite(Date.parse(row.promptStartedAt))
    ) return null;
    const normalized: PoolDiveState = {
        version: 1,
        completedRounds,
        score,
        prompt: row.prompt,
        promptStartedAt: row.promptStartedAt,
    };
    if (typeof row.lastNonceHash === 'string' && /^[a-f0-9]{64}$/.test(row.lastNonceHash)) {
        normalized.lastNonceHash = row.lastNonceHash;
    }
    if (row.lastResponse && typeof row.lastResponse === 'object' && !Array.isArray(row.lastResponse)) {
        normalized.lastResponse = row.lastResponse as Record<string, unknown>;
    }
    return normalized;
}

export function scorePoolDiveMove(prompt: PoolDiveChoice, choice: PoolDiveChoice, elapsedMs: number) {
    const validTiming = Number.isFinite(elapsedMs)
        && elapsedMs >= POOL_DIVE_MIN_RESPONSE_MS
        && elapsedMs <= POOL_DIVE_MAX_RESPONSE_MS;
    const correct = choice === prompt;
    if (!correct || !validTiming) return { correct, validTiming, roundScore: 0 };
    const responsePenalty = Math.floor((elapsedMs - POOL_DIVE_MIN_RESPONSE_MS) / 45);
    return { correct: true, validTiming: true, roundScore: Math.max(15, 100 - responsePenalty) };
}

export function advancePoolDiveState(
    state: PoolDiveState,
    choice: PoolDiveChoice,
    now: Date,
    nextPrompt = choosePoolDivePrompt(state.prompt),
) {
    const elapsedMs = Math.max(0, now.getTime() - Date.parse(state.promptStartedAt));
    const result = scorePoolDiveMove(state.prompt, choice, elapsedMs);
    const completedRounds = state.completedRounds + 1;
    const final = completedRounds >= POOL_DIVE_TOTAL_ROUNDS;
    return {
        result: { ...result, elapsedMs, completedRound: completedRounds },
        final,
        state: {
            version: 1 as const,
            completedRounds,
            score: state.score + result.roundScore,
            prompt: final ? state.prompt : nextPrompt,
            promptStartedAt: now.toISOString(),
        } satisfies PoolDiveState,
    };
}
