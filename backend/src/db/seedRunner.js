const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5433/radiotedu' });

async function seed() {
  await pool.query(`
    INSERT INTO devices (device_code, name, location, is_active)
    VALUES 
      ('KAFE-01', 'Kafeterya Jukebox', 'TEDU Kafeterya', true),
      ('RADIO-01', 'Radio TEDU Ana Studyo', 'Ankara, TEDU', true)
    ON CONFLICT (device_code) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO songs (title, artist, album, duration_seconds, file_url, cover_url, genre)
    VALUES 
      ('Bir Derdim Var', 'mor ve otesi', 'Dunya Yalan Soyluyor', 220, 'http://example.com/song1.mp3', 'https://m.media-amazon.com/images/I/51w7Y6K7SUL._SX355_.jpg', 'Rock'),
      ('Cevapsiz Sorular', 'maNga', 'Sehr-i Huzun', 245, 'http://example.com/song2.mp3', 'https://i.scdn.co/image/ab67616d0000b273dc984252f95406797b5e43c5', 'Rock')
    ON CONFLICT DO NOTHING;
  `);

  const devs = await pool.query('SELECT id, name, device_code FROM devices');
  console.log('Registered Devices:', devs.rows);
  await pool.end();
}

seed().catch(console.error);
