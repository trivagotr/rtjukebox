-- Seed Data for RadioTEDU

-- Add Default Device
INSERT INTO devices (device_code, name, location, is_active)
VALUES ('RADIO-01', 'Radio TEDU Ana Stüdyo', 'Ankara, TEDÜ', true)
ON CONFLICT (device_code) DO NOTHING;

-- Add Sample Songs
INSERT INTO songs (title, artist, album, duration_seconds, file_url, cover_url, genre)
VALUES 
('Bir Derdim Var', 'mor ve ötesi', 'Dünya Yalan Söylüyor', 220, 'http://example.com/song1.mp3', 'https://m.media-amazon.com/images/I/51w7Y6K7SUL._SX355_.jpg', 'Rock'),
('Cevapsız Sorular', 'maNga', 'Şehr-i Hüzün', 245, 'http://example.com/song2.mp3', 'https://i.scdn.co/image/ab67616d0000b273dc984252f95406797b5e43c5', 'Rock'),
('Papatya', 'Teoman', 'Teoman', 210, 'http://example.com/song3.mp3', 'https://i.scdn.co/image/ab67616d0000b273ef39f77f3e09880e69213123', 'Rock'),
('Ele Güne Karşı', 'MFÖ', 'Ele Güne Karşı Yapayalnız', 195, 'http://example.com/song4.mp3', 'https://i.scdn.co/image/ab67616d0000b273418e268a71990c746777174e', 'Pop'),
('Ben Böyleyim', 'Athena', 'Athena', 215, 'http://example.com/song5.mp3', 'https://i.scdn.co/image/ab67616d0000b273ce96f3068e90680327f91cc4', 'Ska');
