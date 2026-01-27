require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setPassword() {
    await pool.query("UPDATE devices SET password = '1343' WHERE device_code = 'CHILL-IN'");
    console.log('✅ Password set to 1343 for CHILL-IN');
    process.exit(0);
}
setPassword();
