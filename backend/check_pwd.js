require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
    const result = await pool.query('SELECT device_code, password FROM devices');
    console.log('Devices:');
    result.rows.forEach(row => {
        console.log(`  ${row.device_code} -> password: "${row.password}"`);
    });
    process.exit(0);
}
check();
