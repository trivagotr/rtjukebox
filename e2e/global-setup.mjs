import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must point to a disposable E2E database.');
}

async function globalSetup() {
  const pool = new Pool({ connectionString });

  try {
    const previousDevice = await pool.query('SELECT id FROM devices WHERE device_code = $1', ['E2E-ROOM']);
    if (previousDevice.rows[0]) {
      const deviceId = previousDevice.rows[0].id;
      await pool.query('DELETE FROM votes WHERE queue_item_id IN (SELECT id FROM queue_items WHERE device_id = $1)', [deviceId]);
      await pool.query('DELETE FROM queue_items WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM device_sessions WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
    }

    await pool.query('DELETE FROM songs WHERE spotify_uri LIKE $1', ['spotify:track:e2e-%']);
    await pool.query('DELETE FROM users WHERE email = $1', ['e2e-member@radiotedu.com']);

    await pool.query(
      `INSERT INTO devices (device_code, name, location, password, is_active)
       VALUES ($1, $2, $3, $4, FALSE)`,
      ['E2E-ROOM', 'E2E Test Room', 'Automation', 'e2e-room-password'],
    );

    const passwordHash = await bcrypt.hash('e2e-member-password', 4);
    await pool.query(
      `INSERT INTO users (email, password_hash, display_name, is_guest, role)
       VALUES ($1, $2, $3, FALSE, 'user')`,
      ['e2e-member@radiotedu.com', passwordHash, 'E2E Member'],
    );

    await pool.query(
      `INSERT INTO songs (source_type, visibility, asset_role, spotify_uri, title, artist, album, duration_ms, is_active)
       VALUES
         ('local', 'public', 'e2e-test', 'spotify:track:e2e-a', 'E2E Song Alpha', 'Test Artist', 'E2E Album', 180000, TRUE),
         ('local', 'public', 'e2e-test', 'spotify:track:e2e-b', 'E2E Song Beta', 'Test Artist', 'E2E Album', 180000, TRUE)`,
    );
  } finally {
    await pool.end();
  }
}

export default globalSetup;
