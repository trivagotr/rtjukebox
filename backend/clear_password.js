const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function clearPasswords() {
    // Clear all device passwords temporarily
    await pool.query('UPDATE devices SET password = NULL');
    console.log('✅ All device passwords cleared!');

    const result = await pool.query('SELECT device_code, name, password FROM devices');
    console.log('Updated devices:');
    console.table(result.rows);
    process.exit(0);
}
clearPasswords();
