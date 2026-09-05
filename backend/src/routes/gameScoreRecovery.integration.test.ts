import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import express from 'express';
import type { Server } from 'http';
import { spawnSync } from 'child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Explicit opt-in; never use DATABASE_URL or an existing application's credentials.
const url = process.env.GAME_RECOVERY_TEST_DATABASE_URL;
const enabled = Boolean(url);
const fault = vi.hoisted(() => ({ mode: '' }));
vi.mock('../db', async () => {
    const { Pool } = await import('pg');
    const connectionString = process.env.GAME_RECOVERY_TEST_DATABASE_URL;
    const pool = new Pool({ connectionString, max: 12 });
    return { db: {
        query: (sql: string, values?: any[]) => pool.query(sql, values),
        pool: {
            end: () => pool.end(),
            connect: async () => {
                const client = await pool.connect();
                return {
                    release: (destroy?: boolean) => client.release(destroy),
                    query: async (sql: string, values?: any[]) => {
                        if (fault.mode === 'rollback-connection' && sql.includes('INSERT INTO game_score_recoveries')) {
                            fault.mode = 'rollback-wire';
                            throw new Error('synthetic transaction failure');
                        }
                        if (fault.mode === 'rollback-wire' && sql === 'ROLLBACK') {
                            fault.mode = '';
                            throw new Error('synthetic rollback connection failure');
                        }
                        if (fault.mode === 'rollback' && sql.includes('INSERT INTO game_score_recoveries')) {
                            fault.mode = '';
                            throw new Error('synthetic failure before commit');
                        }
                        if (fault.mode === 'commit-before' && sql === 'COMMIT') {
                            fault.mode = '';
                            throw new Error('synthetic uncommitted COMMIT failure');
                        }
                        const result = await client.query(sql, values);
                        if (fault.mode === 'commit-after' && sql === 'COMMIT') {
                            fault.mode = '';
                            throw new Error('synthetic lost commit acknowledgement');
                        }
                        return result;
                    },
                };
            },
        },
    } };
});

describe.skipIf(!enabled)('durable score recovery with isolated PostgreSQL', () => {
    let pool: Pool;
    let server: Server;
    let baseUrl: string;
    let handler: typeof import('./gamification').handleGameScoreRequest;
    let proofs: typeof import('../services/gameSessionProof');
    const gameId = randomUUID();
    const otherGameId = randomUUID();
    beforeAll(async () => {
        const parsed = new URL(url!);
        if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55436'
            || parsed.pathname !== '/mobile136_test') {
            throw new Error('Requires dedicated loopback port 55436 database mobile136_test');
        }
        pool = new Pool({ connectionString: url });
        // Load the actual account/Gold table definitions, excluding unrelated Study
        // migrations whose prerequisites are not part of this isolated test database.
        const schema = readFileSync(path.resolve('src/db/schema.sql'), 'utf8');
        for (const table of ['users', 'user_points', 'user_monthly_rank_scores', 'points_ledger', 'arcade_games', 'game_score_submissions', 'refresh_tokens', 'legal_acceptance_events', 'gold_economy_rules', 'app_events', 'market_items']) {
            const definition = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
            if (!definition) throw new Error(`Missing actual table definition: ${table}`);
            await pool.query(definition[0]);
        }
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INTEGER;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(8);
            ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
            ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_user_idempotency
                ON points_ledger(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
            ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS client_round_id VARCHAR(120);
            ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS reported_score INTEGER;
            ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS server_elapsed_seconds INTEGER;
            ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'legacy';
            CREATE UNIQUE INDEX IF NOT EXISTS idx_game_score_submissions_user_round
                ON game_score_submissions(user_id, client_round_id) WHERE client_round_id IS NOT NULL;
        `);
        await pool.query(readFileSync(path.resolve('src/db/migrations/20260905_game_score_recovery.sql'), 'utf8'));
        for (const id of [gameId, otherGameId]) {
            await pool.query(`INSERT INTO arcade_games (id, slug, title, point_rate, daily_point_limit, metadata)
                VALUES ($1::uuid, $1::text, 'Synthetic recovery game', 1, 10,
                '{"verification":"client-timed-session","surface":"mobile"}')`, [id]);
        }
        handler = (await import('./gamification')).handleGameScoreRequest;
        proofs = await import('../services/gameSessionProof');
        await pool.query(`INSERT INTO gold_economy_rules (rule_key, direction, amount, category, enabled, description)
            VALUES ('first_login', 'earn', 1, 'social', false, 'Disabled in isolated recovery tests')
            ON CONFLICT (rule_key) DO NOTHING`);
        const app = express();
        app.use(express.json());
        app.use('/auth', (await import('./auth')).default);
        app.use('/gamification', (await import('./gamification')).default);
        server = await new Promise<Server>(resolve => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing isolated HTTP listener');
        baseUrl = `http://127.0.0.1:${address.port}`;
    }, 30000);

    afterAll(async () => {
        if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (pool) await pool.end();
        const { db } = await import('../db');
        await db.pool.end();
    });

    async function account() {
        const id = randomUUID();
        await pool.query(`INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Synthetic recovery user')`,
            [id, `${id}@example.invalid`]);
        return id;
    }
    async function http(route: string, body?: any, token?: string) {
        const response = await fetch(baseUrl + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() as any };
    }
    function request(userId: string, round = randomUUID(), game = gameId) {
        const proof = proofs.issueGameSessionProof({ userId, gameId: game, clientRoundId: round, nowMs: Date.now() - 6000 });
        return { user: { id: userId, role: 'user' }, params: { gameId: game }, body: {
            score: 6, play_duration_ms: 5000, session_id: proof.session.id,
            nonce: proof.nonce, client_round_id: round, submission_source: 'mobile_game',
        } };
    }
    async function submit(req: any) {
        const res: any = { statusCode: 200, body: null };
        res.status = (code: number) => { res.statusCode = code; return res; };
        res.json = (body: any) => { res.body = body; return res; };
        await handler(req, res);
        return { status: res.statusCode, body: res.body };
    }
    async function reconcile(id: string, scores: number, gold: number) {
        const result = await pool.query(`SELECT
            (SELECT count(*)::int FROM game_score_submissions WHERE user_id=$1) scores,
            (SELECT count(*)::int FROM game_score_recoveries WHERE user_id=$1) recoveries,
            (SELECT COALESCE(sum(amount),0)::int FROM points_ledger WHERE user_id=$1) ledger,
            COALESCE(p.spendable_points,0) spendable, COALESCE(p.lifetime_points,0) lifetime,
            COALESCE(p.monthly_points,0) monthly FROM users u LEFT JOIN user_points p ON p.user_id=u.id WHERE u.id=$1`, [id]);
        expect(result.rows[0]).toEqual({ scores, recoveries: scores, ledger: gold, spendable: gold, lifetime: gold, monthly: gold });
    }
    it('returns exactly the committed response without a second score or ledger entry', async () => {
        const id = await account(), req = request(id);
        const first = await submit(req);
        expect(first.status).toBe(201);
        expect(await submit(req)).toEqual(first);
        await reconcile(id, 1, 6);
        const ledger = await pool.query('SELECT count(*)::int n FROM points_ledger WHERE user_id=$1', [id]);
        expect(ledger.rows[0].n).toBe(1);
    });
    it.each(['score', 'play_duration_ms', 'session_id', 'nonce', 'gameId', 'missing_session'])('rejects changed %s', async field => {
        const id = await account(), req: any = request(id);
        expect((await submit(req)).status).toBe(201);
        const changed = structuredClone(req);
        if (field === 'gameId') changed.params.gameId = otherGameId;
        else if (field === 'missing_session') delete changed.body.session_id;
        else changed.body[field] = typeof changed.body[field] === 'number' ? changed.body[field] + 1 : randomUUID();
        expect([400, 409]).toContain((await submit(changed)).status);
        await reconcile(id, 1, 6);
    });
    it('rejects cross-user ownership and a changed round', async () => {
        const id = await account(), other = await account(), req = request(id);
        const stolen = structuredClone(req); stolen.user.id = other;
        expect((await submit(stolen)).status).toBe(403);
        const changed = structuredClone(req); changed.body.client_round_id = randomUUID();
        expect((await submit(changed)).status).toBe(403);
        expect((await submit(req)).status).toBe(201);
        await reconcile(id, 1, 6); await reconcile(other, 0, 0);
    });
    it('serializes simultaneous exact retries', async () => {
        const id = await account(), req = request(id);
        const results = await Promise.all(Array.from({ length: 8 }, () => submit(req)));
        expect(results.every(r => r.status === 201)).toBe(true);
        expect(results.every(r => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
        await reconcile(id, 1, 6);
    });
    it('rejects a simultaneous conflicting payload under one round', async () => {
        const id = await account(), req = request(id), changed = structuredClone(req);
        changed.body.play_duration_ms += 1;
        const results = await Promise.all([submit(req), submit(changed)]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]);
        await reconcile(id, 1, 6);
    });
    it('waits for an in-flight user transaction before recovering', async () => {
        const id = await account(), req = request(id), blocker = await pool.connect();
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
        let finished = false;
        const pending = submit(req).then(r => { finished = true; return r; });
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(finished).toBe(false);
        await blocker.query('COMMIT'); blocker.release();
        expect((await pending).status).toBe(201);
        expect((await submit(req)).status).toBe(201);
        await reconcile(id, 1, 6);
    });
    it('enforces daily limits across concurrent distinct rounds and recovers zero awards', async () => {
        const id = await account(), requests = Array.from({ length: 4 }, () => request(id));
        const results = await Promise.all(requests.map(submit));
        expect(results.every(r => r.status === 201)).toBe(true);
        await reconcile(id, 4, 10);
        for (let i = 0; i < requests.length; i++) expect(await submit(requests[i])).toEqual(results[i]);
        await reconcile(id, 4, 10);
    });
    it('recovers after all volatile proof state is cleared on restart', async () => {
        const id = await account(), req = request(id), first = await submit(req);
        proofs.resetGameSessionProofsForTests();
        expect(await submit(req)).toEqual(first);
        await reconcile(id, 1, 6);
    });
    it.each(['rollback', 'commit-before', 'rollback-connection'])('retries safely after %s failure', async mode => {
        const id = await account(), req = request(id); fault.mode = mode;
        expect((await submit(req)).status).toBe(500);
        await reconcile(id, 0, 0);
        expect((await submit(req)).status).toBe(201);
        await reconcile(id, 1, 6);
    });
    it('recovers an ambiguous successful COMMIT without double awarding', async () => {
        const id = await account(), req = request(id); fault.mode = 'commit-after';
        expect((await submit(req)).status).toBe(500);
        proofs.resetGameSessionProofsForTests();
        expect((await submit(req)).status).toBe(201);
        await reconcile(id, 1, 6);
    });
    it('recovers from a fresh Node process with no proof memory', async () => {
        const id = await account(), req = request(id), first = await submit(req);
        const script = `
            const fs = require('fs');
            const { handleGameScoreRequest } = require('./src/routes/gamification.ts');
            const { db } = require('./src/db.ts');
            (async () => {
                const req = JSON.parse(fs.readFileSync(0, 'utf8'));
                const res = { statusCode: 200, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } };
                try { await handleGameScoreRequest(req, res); console.log(JSON.stringify({ status: res.statusCode, body: res.body })); }
                finally { await db.pool.end(); }
            })().catch(e => { console.error(e.message); process.exitCode=1; });
        `;
        const child = spawnSync(process.execPath, ['--require', 'tsx/cjs', '-e', script], {
            cwd: process.cwd(), input: JSON.stringify(req), encoding: 'utf8', timeout: 15000,
            env: { ...process.env, DATABASE_URL: url!, NODE_ENV: 'test' },
        });
        expect(child.status, child.stderr).toBe(0);
        expect(JSON.parse(child.stdout.trim())).toEqual(first);
        await reconcile(id, 1, 6);
    });
    it('preserves registration, login, refresh rotation, logout and authenticated recovery over HTTP', async () => {
        const email = `synthetic-${randomUUID()}@gmail.com`, password = 'Synthetic-only-password-123!';
        const registered = await http('/auth/register', { email, password, display_name: 'Synthetic User', age: 25,
            terms_accepted: true, privacy_acknowledged: true, terms_version: '2026-08-22', privacy_version: '2026-08-22' });
        expect(registered.status).toBe(201);
        expect(registered.body.data.user.password_hash).toBeUndefined();
        const login = await http('/auth/login', { email, password });
        expect(login.status).toBe(200);
        const token = login.body.data.access_token;
        const req = request(login.body.data.user.id);
        expect((await http(`/gamification/games/${gameId}/score`, req.body)).status).toBe(401);
        const first = await http(`/gamification/games/${gameId}/score`, req.body, token);
        expect(first.status).toBe(201);
        const refreshed = await http('/auth/refresh', { refresh_token: login.body.data.refresh_token });
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.data.refresh_token).not.toBe(login.body.data.refresh_token);
        expect((await http('/auth/refresh', { refresh_token: login.body.data.refresh_token })).status).toBe(401);
        expect(await http(`/gamification/games/${gameId}/score`, req.body, refreshed.body.data.access_token)).toEqual(first);
        expect((await http('/auth/logout', { refresh_token: refreshed.body.data.refresh_token })).status).toBe(200);
        expect((await http('/auth/me', undefined, refreshed.body.data.access_token)).status).toBe(401);
        expect((await http('/auth/refresh', { refresh_token: refreshed.body.data.refresh_token })).status).toBe(401);
        await reconcile(req.user.id, 1, 6);
    });
    it('agrees on spendable, lifetime and current-month Gold across account and gamification endpoints', async () => {
        const id = await account();
        expect((await submit(request(id))).status).toBe(201);
        // Simulate a historical accumulated monthly cache without changing this month's rank.
        await pool.query('UPDATE user_points SET monthly_points=999 WHERE user_id=$1', [id]);
        const { createAuthSession } = await import('./auth');
        const tokens = await createAuthSession(id, `${id}@example.invalid`, 'user');
        const me = await http('/auth/me', undefined, tokens.access_token);
        const session = await http('/auth/session', undefined, tokens.access_token);
        const gamification = await http('/gamification/me', undefined, tokens.access_token);
        const home = await http('/gamification/home', undefined, tokens.access_token);
        expect([me.status, session.status, gamification.status, home.status]).toEqual([200, 200, 200, 200]);
        expect(me.body.data.gold_balance).toBe(6);
        expect(me.body.data.monthly_rank_score).toBe(6);
        expect(session.body.data.points).toEqual({ gold_balance: 6, lifetime_gold_earned: 6 });
        expect(gamification.body.data.points).toMatchObject({ spendable_points: 6, lifetime_points: 6, monthly_points: 6 });
        expect(home.body.data.points).toMatchObject({ spendable_points: 6, lifetime_points: 6, monthly_points: 6 });
    });
});
