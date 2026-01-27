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

        // 3. Create index
        await db.query('CREATE INDEX IF NOT EXISTS idx_device_sessions_lookup ON device_sessions(user_id, device_id)');
        console.log('✅ Index ensured.');

        console.log('🎊 Migration Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

migrate();
