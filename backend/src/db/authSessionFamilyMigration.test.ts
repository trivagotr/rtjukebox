import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
    __dirname,
    'migrations/20260830_auth_session_family.sql',
);

describe('auth session-family migration contract', () => {
    it('adds the nullable UUID family column without rewriting legacy rows', () => {
        const migration = fs.readFileSync(migrationPath, 'utf8');

        expect(migration).toContain('ADD COLUMN IF NOT EXISTS session_family_id UUID');
        expect(migration).not.toMatch(/UPDATE\s+refresh_tokens/i);
    });

    it('adds idempotent uniqueness and active-family lookup indexes', () => {
        const migration = fs.readFileSync(migrationPath, 'utf8');

        expect(migration).toContain("conname = 'refresh_tokens_user_session_family_key'");
        expect(migration).toContain("conrelid = 'refresh_tokens'::regclass");
        expect(migration).toContain('UNIQUE (user_id, session_family_id)');
        expect(migration).toContain(
            'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_family_expires',
        );
        expect(migration).toContain('(user_id, session_family_id, expires_at)');
        expect(migration).toContain('WHERE session_family_id IS NOT NULL');
    });

    it('is transaction bounded', () => {
        const migration = fs.readFileSync(migrationPath, 'utf8').trim();

        expect(migration.startsWith('BEGIN;')).toBe(true);
        expect(migration.endsWith('COMMIT;')).toBe(true);
    });
});
