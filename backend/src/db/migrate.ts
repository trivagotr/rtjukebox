import 'dotenv/config';
import { db } from '../db';

async function migrate() {
    console.log('🚀 Starting Database Migration...');

    try {
        // 1. Add password column to devices
        console.log('--- Checking "devices" table for "password" column ---');
        const columnCheck = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'devices' AND column_name = 'password'
        `);

        if (columnCheck.rows.length === 0) {
            console.log('➕ Adding "password" column to "devices"...');
            await db.query('ALTER TABLE devices ADD COLUMN password VARCHAR(50)');
            console.log('✅ Column added.');
        } else {
            console.log('ℹ️ "password" column already exists.');
        }

        // 2. Create device_sessions table
        console.log('--- Checking for "device_sessions" table ---');
        await db.query(`
            CREATE TABLE IF NOT EXISTS device_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, device_id)
            )
        `);
        console.log('✅ "device_sessions" table ensured.');

        // 4. Add last_ip column to users
        console.log('--- Checking "users" table for "last_ip" column ---');
        const userColumnCheck = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'last_ip'
        `);

        if (userColumnCheck.rows.length === 0) {
            console.log('➕ Adding "last_ip" column to "users"...');
            await db.query('ALTER TABLE users ADD COLUMN last_ip VARCHAR(45)');
            console.log('✅ Column added.');
        } else {
            console.log('ℹ️ "last_ip" column already exists.');
        }

        // 5. Add user_agent column to users
        console.log('--- Checking "users" table for "user_agent" column ---');
        const uaColumnCheck = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'user_agent'
        `);

        if (uaColumnCheck.rows.length === 0) {
            console.log('➕ Adding "user_agent" column to "users"...');
            await db.query('ALTER TABLE users ADD COLUMN user_agent TEXT');
            console.log('✅ Column added.');
        } else {
            console.log('ℹ️ "user_agent" column already exists.');
        }

        // 6. Add last_super_vote_at column to users
        console.log('--- Checking "users" table for "last_super_vote_at" column ---');
        const superVoteColumnCheck = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'last_super_vote_at'
        `);

        if (superVoteColumnCheck.rows.length === 0) {
            console.log('➕ Adding "last_super_vote_at" column to "users"...');
            await db.query('ALTER TABLE users ADD COLUMN last_super_vote_at TIMESTAMP');
            console.log('✅ Column added.');
        } else {
            console.log('ℹ️ "last_super_vote_at" column already exists.');
        }

        // 7. Create next song voting tables (separate from Jukebox queue voting)
        console.log('--- Ensuring next song voting tables ---');
        await db.query(`
            CREATE TABLE IF NOT EXISTS next_song_vote_rounds (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                prompt VARCHAR(300),
                agent_id VARCHAR(120),
                started_at TIMESTAMP DEFAULT NOW(),
                locked_at TIMESTAMP,
                resolved_at TIMESTAMP,
                cancelled_at TIMESTAMP,
                expires_at TIMESTAMP,
                winning_candidate_id UUID,
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT chk_next_song_vote_round_status CHECK (status IN ('active', 'locked', 'resolved', 'cancelled'))
            )
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_next_song_vote_rounds_active ON next_song_vote_rounds(device_id, started_at DESC) WHERE status = \'active\'');
        await db.query('CREATE INDEX IF NOT EXISTS idx_next_song_vote_rounds_status ON next_song_vote_rounds(status, started_at DESC)');

        await db.query(`
            CREATE TABLE IF NOT EXISTS next_song_vote_candidates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
                external_id VARCHAR(200),
                song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
                title VARCHAR(200) NOT NULL,
                artist VARCHAR(200),
                album VARCHAR(200),
                duration_seconds INTEGER,
                artwork_url VARCHAR(1000),
                preview_url VARCHAR(1000),
                stream_url VARCHAR(1000),
                metadata JSONB DEFAULT '{}'::jsonb,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_next_song_vote_candidates_round ON next_song_vote_candidates(round_id, position)');

        await db.query('ALTER TABLE next_song_vote_rounds DROP CONSTRAINT IF EXISTS fk_next_song_vote_winner');
        await db.query(`
            ALTER TABLE next_song_vote_rounds
            ADD CONSTRAINT fk_next_song_vote_winner
            FOREIGN KEY (winning_candidate_id) REFERENCES next_song_vote_candidates(id) ON DELETE SET NULL
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS next_song_votes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
                candidate_id UUID NOT NULL REFERENCES next_song_vote_candidates(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                guest_fingerprint VARCHAR(128),
                ip_hash VARCHAR(128),
                user_agent_hash VARCHAR(128),
                vote_weight DECIMAL(5,2) NOT NULL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_user_once ON next_song_votes(round_id, user_id) WHERE user_id IS NOT NULL');
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_guest_once ON next_song_votes(round_id, guest_fingerprint) WHERE user_id IS NULL AND guest_fingerprint IS NOT NULL');
        await db.query('DROP INDEX IF EXISTS idx_next_song_votes_guest_ip_ua_once');
        await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_guest_ip_ua_once ON next_song_votes(round_id, ip_hash, user_agent_hash) WHERE user_id IS NULL AND guest_fingerprint IS NULL AND ip_hash IS NOT NULL AND user_agent_hash IS NOT NULL');
        await db.query('CREATE INDEX IF NOT EXISTS idx_next_song_votes_candidate ON next_song_votes(candidate_id)');

        await db.query(`
            CREATE TABLE IF NOT EXISTS next_song_vote_rewards (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reward_type VARCHAR(40) NOT NULL,
                points INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(round_id, user_id, reward_type)
            )
        `);
        await db.query('CREATE INDEX IF NOT EXISTS idx_next_song_vote_rewards_user ON next_song_vote_rewards(user_id, created_at DESC)');
        console.log('✅ Next song voting tables ensured.');

        console.log('🎊 Migration Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

migrate();
