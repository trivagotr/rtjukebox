const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function check() {
    const result = await pool.query('SELECT device_code, name, password FROM devices');
    console.log('Current devices and passwords:');
    console.table(result.rows);
    process.exit(0);
}
check();
