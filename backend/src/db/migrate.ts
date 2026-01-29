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

        console.log('🎊 Migration Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

migrate();
