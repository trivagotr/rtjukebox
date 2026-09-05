import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applySchemaSql,
    DEFAULT_SCHEMA_SQL_PATH,
    loadSchemaSql,
    resolveSchemaSqlPath,
    runSchemaMigration,
} from './migrate.js';

describe('db migration helper', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves schema.sql from the backend src directory by default', () => {
        const expectedPath = path.resolve(process.cwd(), 'src/db/schema.sql');

        expect(DEFAULT_SCHEMA_SQL_PATH).toBe(expectedPath);
        expect(resolveSchemaSqlPath()).toBe(expectedPath);
    });

    it('loads the schema file from disk', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtjukebox-migrate-'));
        const schemaPath = path.join(tempDir, 'schema.sql');
        fs.writeFileSync(schemaPath, 'SELECT 1;', 'utf8');

        try {
            expect(loadSchemaSql(schemaPath)).toBe('SELECT 1;');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('includes monthly rank and guest limit tables in the schema', () => {
        const schemaSql = loadSchemaSql();

        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS user_monthly_rank_scores');
        expect(schemaSql).toContain('UNIQUE(user_id, year_month)');
        expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_user_monthly_rank_scores_user_month');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS guest_daily_song_limits');
        expect(schemaSql).toContain('UNIQUE(fingerprint, day_key)');
        expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_guest_daily_song_limits_day_key');
    });

    it('includes user session metadata columns used by auth routes', () => {
        const schemaSql = loadSchemaSql();

        expect(schemaSql).toContain('last_ip INET');
        expect(schemaSql).toContain('user_agent TEXT');
        expect(schemaSql).toContain('last_super_vote_at TIMESTAMP');
        expect(schemaSql).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip INET');
        expect(schemaSql).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent TEXT');
        expect(schemaSql).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_super_vote_at TIMESTAMP');
    });

    it('includes podcast feed registry tables in the schema', () => {
        const schemaSql = loadSchemaSql();

        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS podcast_feeds');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS podcast_episodes');
        expect(schemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_guid_unique');
        expect(schemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_audio_url_unique');
        expect(schemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_episode_url_unique');
        expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published_at');
    });

    it('includes gamification tables in the schema', () => {
        const schemaSql = loadSchemaSql();

        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS user_points');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS points_ledger');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS market_items');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS market_redemptions');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS app_events');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS event_registrations');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS arcade_games');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS game_score_submissions');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS user_profile_customization');
        expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS qr_reward_claims');
    });

    it('includes Study Pomodoro session metadata in the schema', () => {
        const schemaSql = loadSchemaSql();

        expect(schemaSql).toContain('session_type VARCHAR(20) NOT NULL DEFAULT');
        expect(schemaSql).toContain("CHECK (session_type IN ('study', 'pomodoro'))");
        expect(schemaSql).toContain('pomodoro_target_minutes INTEGER');
        expect(schemaSql).toContain('seat_id VARCHAR(120)');
        expect(schemaSql).toContain('ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS session_type');
        expect(schemaSql).toContain('ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS pomodoro_target_minutes');
        expect(schemaSql).toContain('ALTER TABLE study_session_events ADD COLUMN IF NOT EXISTS seat_id');
    });

    it('applies schema sql inside a single transaction and forces UTF-8 client encoding', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await applySchemaSql({ query }, 'SELECT 1;');

        expect(query.mock.calls.map((call) => call[0])).toEqual([
            "SET client_encoding TO 'UTF8'",
            'BEGIN',
            'SELECT 1;',
            'COMMIT',
        ]);
    });

    it('rolls back when schema execution fails', async () => {
        const failure = new Error('boom');
        const query = vi.fn(async (sql: string) => {
            if (sql === 'SELECT 1;') {
                throw failure;
            }

            return { rows: [] };
        });

        await expect(applySchemaSql({ query }, 'SELECT 1;')).rejects.toThrow('boom');

        expect(query.mock.calls.map((call) => call[0])).toEqual([
            "SET client_encoding TO 'UTF8'",
            'BEGIN',
            'SELECT 1;',
            'ROLLBACK',
        ]);
    });

    it('runs the migration with a provided pool and releases the client', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtjukebox-migrate-'));
        const schemaPath = path.join(tempDir, 'schema.sql');
        fs.writeFileSync(schemaPath, 'SELECT 42;', 'utf8');

        const release = vi.fn();
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const pool = {
            connect: vi.fn(async () => ({ query, release })),
        };
        const logger = {
            log: vi.fn(),
            error: vi.fn(),
        };

        try {
            await runSchemaMigration({ pool, schemaPath, logger });

            expect(pool.connect).toHaveBeenCalledTimes(1);
            expect(release).toHaveBeenCalledTimes(1);
            expect(query.mock.calls.map((call) => call[0])).toEqual([
                "SET client_encoding TO 'UTF8'",
                'BEGIN',
                'SELECT 42;',
                'COMMIT',
            ]);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
