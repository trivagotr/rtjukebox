-- Register new songs robustly
INSERT INTO songs (title, artist, cover_url, file_url, duration_seconds)
SELECT 'GİT', 'BLOK3', 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17', 'http://192.168.0.13:3000/uploads/songs/BLOK3%20-%20G%C4%B0T%20(Official%20Music%20Video).mp3', 210
WHERE NOT EXISTS (SELECT 1 FROM songs WHERE file_url = 'http://192.168.0.13:3000/uploads/songs/BLOK3%20-%20G%C4%B0T%20(Official%20Music%20Video).mp3');

INSERT INTO songs (title, artist, cover_url, file_url, duration_seconds)
SELECT 'Die With A Smile', 'Lady Gaga, Bruno Mars', 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9', 'http://192.168.0.13:3000/uploads/songs/Lady%20Gaga,%20Bruno%20Mars%20-%20Die%20With%20A%20Smile%20(Official%20Music%20Video).mp3', 250
WHERE NOT EXISTS (SELECT 1 FROM songs WHERE file_url = 'http://192.168.0.13:3000/uploads/songs/Lady%20Gaga,%20Bruno%20Mars%20-%20Die%20With%20A%20Smile%20(Official%20Music%20Video).mp3');

INSERT INTO songs (title, artist, cover_url, file_url, duration_seconds)
SELECT 'The Fate of Ophelia', 'Taylor Swift', 'https://images.unsplash.com/photo-1459749411177-042180ce673c', 'http://192.168.0.13:3000/uploads/songs/Taylor%20Swift%20-%20The%20Fate%20of%20Ophelia%20(Official%20Music%20Video).mp3', 230
WHERE NOT EXISTS (SELECT 1 FROM songs WHERE file_url = 'http://192.168.0.13:3000/uploads/songs/Taylor%20Swift%20-%20The%20Fate%20of%20Ophelia%20(Official%20Music%20Video).mp3');
