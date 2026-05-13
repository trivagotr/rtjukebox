# RadioTEDU / RT Jukebox Tam Teknik Proje Raporu

Rapor tarihi: 2026-05-13  
İncelenen branch: `main`  
İncelenen commit: `16b070c4`  
Ana repository: `https://github.com/trivagotr/rtjukebox.git`

Bu doküman projeyi yazılım bilen birinin uçtan uca anlayabilmesi için hazırlanmıştır. Amaç sadece dosya listesi vermek değil, programın hangi girdiyi aldığı, hangi veriyi nereye yazdığı, hangi servisi çağırdığı ve hangi çıktıyı ürettiğini net şekilde açıklamaktır.

## 1. Sistem Özeti

Bu proje RadioTEDU için dört ana parçadan oluşan bir radyo, jukebox, kiosk, podcast ve gamification sistemidir:

1. `backend/`: Express + TypeScript + PostgreSQL API sunucusu. Kimlik doğrulama, kullanıcılar, cihazlar, şarkı kataloğu, sıra, oy sistemi, Spotify bağlantısı, podcast RSS kayıtları, etkinlikler, oyun puanı, market ve profil verilerinin ana kaynağıdır.
2. `kiosk-web/`: Kiosk cihazında açılan statik web oynatıcıdır. Cihaz kodu ile backend'e bağlanır, sırayı dinler, local dosyaları HTML audio ile, Spotify şarkılarını Spotify Web Playback SDK ile çalar.
3. `jukebox-web-controller/`: React/Vite web arayüzüdür. Kullanıcı tarafında jukebox'a bağlanma, şarkı arama, sıraya ekleme, oy verme ve leaderboard gösterir. Admin tarafında cihaz, şarkı, Spotify app/device bağlantısı ve temel yönetim ekranları vardır.
4. `mobile/`: React Native mobil uygulamadır. Radyo yayınlarını, podcastleri, jukebox'u, profil/gamification ekranlarını, etkinlikleri, marketi, sıralamayı ve gerçek mini oyunları içerir.

Sistem tek backend'e bağlıdır. Mobil uygulama, kiosk ve web controller aynı PostgreSQL veritabanını API üzerinden kullanır. Kritik canlı yol şu mantıkla çalışır:

```text
Kullanıcı mobil/web üzerinden cihaz seçer
  -> backend device_sessions tablosuna bağlantıyı yazar
  -> kullanıcı şarkı arar veya local katalogdan seçer
  -> backend queue_items tablosuna pending kayıt açar
  -> Socket.IO ile kiosk ve diğer istemcilere queue_updated gönderilir
  -> kiosk sıradaki parçayı oynatır
  -> kiosk /kiosk/now-playing ile backend'e "şu şarkı başladı/bitti" der
  -> backend queue_items status alanlarını günceller
  -> şarkı bittiyse jingle/reklam/autoplay kararını verir
  -> Socket.IO ile yeni durum yayılır
```

## 2. Repository ve Çalışma Modeli

Kökte tek bir `package.json` yoktur. Her uygulama kendi klasöründe bağımsız çalışır:

| Klasör | Tip | Ana komutlar | Açıklama |
|---|---|---|---|
| `backend/` | Node/Express API | `npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run db:migrate` | API, Socket.IO, PostgreSQL migration |
| `mobile/` | React Native | `npm start`, `npm run android`, `npm run ios`, `npm test` | Android/iOS mobil uygulama |
| `jukebox-web-controller/` | Vite React | `npm run dev`, `npm run build`, `npm run preview` | Web kullanıcı/admin kontrol paneli |
| `kiosk-web/` | Statik web | backend static servis eder | Kiosk oynatıcı |
| `docs/` | Dokümantasyon | yok | Planlar ve bu rapor |

Canlı yayın modelinde backend genelde `PORT=3000` üzerinde çalışır. `PUBLIC_BASE_PATH=/jukebox` verildiğinde aynı API'ler hem kök path'ten hem de `/jukebox` subdirectory altından mount edilir.

Örnek canlı API path'leri:

```text
https://radiotedu.com/jukebox/api/v1/auth/login
https://radiotedu.com/jukebox/api/v1/jukebox/queue
https://radiotedu.com/jukebox/api/v1/podcasts
https://radiotedu.com/jukebox/socket.io
https://radiotedu.com/jukebox/kiosk
```

## 3. Runtime ve Subdirectory Mantığı

Backend'de `src/server.ts` içinde `PUBLIC_BASE_PATH` normalize edilir. `mountWithOptionalPublicBase()` fonksiyonu şu işi yapar:

```text
Girdi: routePath = /api/v1/auth
PUBLIC_BASE_PATH boşsa:
  -> sadece /api/v1/auth mount edilir
PUBLIC_BASE_PATH=/jukebox ise:
  -> /api/v1/auth mount edilir
  -> /jukebox/api/v1/auth da mount edilir
```

Socket.IO için de `src/socket.ts` içinde path hesaplanır:

```text
PUBLIC_BASE_PATH boşsa socket path: /socket.io
PUBLIC_BASE_PATH=/jukebox ise socket path: /jukebox/socket.io
```

Mobil uygulama `mobile/src/services/config.ts` içinde production için şu şekilde ayarlıdır:

```text
SERVER_DOMAIN = radiotedu.com
PROD_SERVER_ORIGIN = https://radiotedu.com/jukebox
BASE_API = https://radiotedu.com/jukebox/api/v1
SOCKET_ORIGIN = https://radiotedu.com
SOCKET_PATH = /jukebox/socket.io
```

Kiosk web `kiosk-web/config.js` içinde bulunduğu path'ten base path çıkarır. Örneğin sayfa `/jukebox/kiosk/index.html` altında açıldıysa `PUBLIC_BASE_PATH=/jukebox` olarak algılar.

Web controller `jukebox-web-controller/src/runtimeConfig.ts` içinde `import.meta.env.BASE_URL` değerinden public base path üretir. Development modda API origin otomatik `:3000` olur, production modda aynı origin kullanılır. İstenirse `VITE_API_ORIGIN` ile override edilir.

## 4. Backend Genel Yapısı

Backend ana dosyası `backend/src/server.ts` dosyasıdır.

Program başlatılınca şu adımlar olur:

1. `.env` yüklenir.
2. Express app oluşturulur.
3. HTTP server oluşturulur.
4. Socket.IO başlatılır.
5. Helmet, CORS, JSON parser, request logger ve rate limit middleware'leri eklenir.
6. Static dosyalar mount edilir:
   - `/kiosk` -> `kiosk-web/`
   - `/uploads` -> `backend/uploads/`
7. API route'ları mount edilir.
8. Socket handler'ları bağlanır.
9. Global error handler kurulur.
10. `PORT` üzerinden dinlemeye başlanır.

Aktif route grupları:

| Route grubu | Dosya | Görev |
|---|---|---|
| `/api/v1/auth` | `routes/auth.ts` | Register, login, guest, refresh, me, avatar |
| `/api/v1/podcasts` | `routes/podcasts.ts` | Podcast episode listeleme |
| `/api/v1/podcast-feeds` | `routes/podcastFeeds.ts` | Admin RSS feed yönetimi |
| `/api/v1/radio` | `routes/radio.ts` | Radyo status/schedule |
| `/api/v1/radio-profiles` | `routes/radioProfiles.ts` | Admin radyo profili, jingle/reklam/autoplay ayarı |
| `/api/v1/jukebox` | `routes/jukebox.ts` | Jukebox kullanıcı/admin/kiosk işlemleri |
| `/jukebox` | `routes/jukebox.ts` | Eski/alternatif kiosk route mount'u |
| `/api/v1/users` | `routes/users.ts` | Leaderboard ve user stats |
| `/api/v1/spotify` | `routes/spotify.ts` | Spotify OAuth/app config/device auth |
| `/api/v1/gamification` | `routes/gamification.ts` | Puan, market, etkinlik, oyun, dinleme heartbeat |
| `/api/v1/profile` | `routes/profile.ts` | Profil favorileri ve rozetler |
| `/health` | `server.ts` | Basit health check |

API response standardı `backend/src/utils/response.ts` içindedir:

Başarılı cevap:

```json
{
  "success": true,
  "data": {},
  "message": "optional",
  "meta": {}
}
```

Hatalı cevap:

```json
{
  "success": false,
  "error": "message",
  "code": "optional_code"
}
```

## 5. Veritabanı Bağlantısı ve Migration

PostgreSQL bağlantısı `backend/src/db.ts` üzerinden yapılır. `DATABASE_URL` zorunlu ana bağlantı bilgisidir. `DB_SSL=true` ise SSL `rejectUnauthorized=false` ile açılır.

Migration sistemi `backend/src/db/migrate.js` üzerinden çalışır:

```text
npm run db:migrate
  -> src/db/schema.sql okunur
  -> SET client_encoding TO 'UTF8'
  -> BEGIN
  -> schema.sql tamamı uygulanır
  -> COMMIT
```

`schema.sql` idempotent yazılmıştır. `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ve benzeri yapıların amacı aynı migration komutunun tekrar tekrar çalışabilmesidir.

## 6. Veritabanı Modeli

### 6.1 Kullanıcı tabloları

`users`

Ana kullanıcı tablosudur. Registered user, guest ve admin aynı tabloda tutulur.

Önemli kolonlar:

| Kolon | Anlam |
|---|---|
| `id` | UUID primary key |
| `email` | Unique kullanıcı email'i |
| `password_hash` | Bcrypt hash. Guest kullanıcıda NULL |
| `display_name` | Görünen isim |
| `avatar_url` | Upload edilmiş avatar path'i |
| `is_guest` | Guest hesap mı |
| `role` | `guest`, `user`, `moderator`, `admin` |
| `rank_score` | Jukebox/rank ana puanı |
| `vote_weight` | Gelecekte weighted vote için ayrılmış |
| `total_songs_added` | Kullanıcının eklediği toplam şarkı |
| `total_upvotes_received` | Eklediği şarkılara gelen upvote toplamı |
| `total_downvotes_received` | Eklediği şarkılara gelen downvote toplamı |
| `is_banned` | Ban flag |
| `fcm_token` | Push notification token alanı |
| `push_preferences` | Push ayarları JSONB |

Önemli not: Kod `last_ip`, `user_agent`, `last_super_vote_at` kolonlarını kullanıyor. Mevcut `schema.sql` dosyasındaki `CREATE TABLE users` tanımında bu kolonlar görünmüyor. Canlı veritabanında bu kolonlar daha önce elle veya eski migration ile eklenmiş olabilir. Ancak sıfırdan kurulumda register/login/supervote akışları bu kolonlar yoksa hata verir. Bu schema drift kritik operasyonel nottur.

`refresh_tokens`

JWT refresh token'ların hash'lenmiş halini tutar. Program plain refresh token'ı kullanıcıya verir, veritabanına bcrypt hash olarak yazar.

`user_monthly_rank_scores`

Kullanıcının ay bazlı rank puanını tutar. `year_month` formatı `YYYY-MM` ve timezone `Europe/Istanbul` mantığıyla hesaplanır.

`guest_daily_song_limits`

Guest kullanıcıların günlük şarkı ekleme limitini fingerprint bazlı tutar. Kullanıcı guest ise mobil/web bir `x-guest-fingerprint` header'ı gönderir. Backend aynı fingerprint için İstanbul gününde kaç şarkı eklendiğini buradan kontrol eder.

`device_sessions`

Kullanıcı ile kiosk cihazı arasındaki yetkili bağlantıyı tutar. Normal kullanıcı bir cihaza bağlanmadan o cihazın kuyruğuna şarkı ekleyemez veya oy veremez. Admin bu kontrolü bypass eder.

### 6.2 Cihaz tabloları

`devices`

Kiosk cihazlarının ana tablosudur.

Önemli kolonlar:

| Kolon | Anlam |
|---|---|
| `device_code` | Kullanıcıların QR veya manuel giriş ile bağlandığı cihaz kodu |
| `name` | Admin panelde görünen cihaz adı |
| `location` | Cihaz konumu |
| `is_active` | Aktif mi |
| `current_song_id` | Şu an çalan song id |
| `last_heartbeat` | Kiosk son canlılık zamanı |
| `password` | Kiosk registration/user connection şifresi |
| `radio_profile_id` | Bu cihaza atanmış radyo profili |
| `override_enabled` | Cihaz bazlı override açık mı |
| `override_autoplay_spotify_playlist_uri` | Cihaz özel playlist |
| `override_jingle_every_n_songs` | Cihaz özel jingle aralığı |
| `override_ad_break_interval_minutes` | Cihaz özel reklam kuşağı aralığı |
| `last_ad_break_at` | Bu cihazda son reklam kuşağı zamanı |
| `spotify_playback_device_id` | Spotify SDK'nın verdiği playback device id |
| `spotify_player_name` | Kiosk Spotify player adı |
| `spotify_player_is_active` | Spotify player aktif mi |

### 6.3 Şarkı ve sıra tabloları

`songs`

Tüm local ve Spotify şarkıların ortak kataloğudur. Sistem tek tablo ile hybrid çalışır.

Önemli kolonlar:

| Kolon | Anlam |
|---|---|
| `source_type` | `local` veya `spotify` |
| `visibility` | `public` veya `hidden` |
| `asset_role` | `music`, `jingle`, `ad` |
| `spotify_uri` | Spotify track URI |
| `spotify_id` | Spotify track id |
| `file_url` | Local dosya URL'si |
| `title`, `artist`, `album` | Metadata |
| `cover_url` | Kapak görseli |
| `duration_ms`, `duration_seconds` | Süre |
| `is_explicit` | Spotify explicit flag veya local metadata |
| `is_blocked` | Şarkı engelli mi |
| `is_active` | Local dosya aktif mi |
| `play_count` | Toplam çalma sayısı için alan |
| `score` | Şarkının toplam oy skoru |
| `last_played_at` | Son çalma zamanı |

Visibility/role mantığı:

```text
public + music:
  Kullanıcı aramasında görünür, sıraya eklenebilir.

hidden + jingle:
  Kullanıcı görmez. Radyo profilindeki jingle pool'a atanabilir.

hidden + ad:
  Kullanıcı görmez. Radyo profilindeki reklam pool'a atanabilir.

hidden + music:
  Normal kullanıcı ekleyemez. Admin özel amaçla kullanabilir.
```

`queue_items`

Cihaz bazlı tek gerçek playback sırasıdır. Kullanıcı şarkısı, admin şarkısı, autoplay şarkısı, jingle ve reklam aynı tabloda durur.

Önemli kolonlar:

| Kolon | Anlam |
|---|---|
| `device_id` | Hangi kiosk cihazının sırası |
| `song_id` | Çalınacak songs kaydı |
| `added_by` | Şarkıyı ekleyen kullanıcı veya system user |
| `status` | `pending`, `playing`, `played`, `skipped` |
| `queue_reason` | `user`, `admin`, `autoplay`, `jingle`, `ad` |
| `autoplay_radio_profile_id` | Autoplay şarkıyı üreten radyo profili |
| `priority_score` | Sıralama/oy skoru |
| `upvotes`, `downvotes` | Oy toplamları |
| `position` | İleri kullanım için pozisyon |
| `added_at`, `played_at` | Zaman damgaları |

Jingle ve reklam da aynı queue tablosundadır ama kullanıcıya görünen kuyrukta gizlenir. Backend `buildVisibleQueueState()` içinde `queue_reason` değeri `jingle` veya `ad` olan pending item'ları visible queue'dan çıkarır.

`votes`

Queue item'a kullanıcı oyunu tutar. `UNIQUE(queue_item_id, user_id)` vardır. Bir kullanıcı aynı queue item için tek aktif oy tutar.

Oy değerleri:

```text
upvote: 1
downvote: -1
supervote: 3
none: 0, kayıt silinir
```

### 6.4 Radyo profili tabloları

`radio_profiles`

Reusable radyo davranış ayarıdır.

| Kolon | Anlam |
|---|---|
| `name` | Profil adı |
| `autoplay_spotify_playlist_uri` | Sırada şarkı yoksa çekilecek Spotify playlist |
| `jingle_every_n_songs` | Her kaç normal şarkıdan sonra jingle |
| `ad_break_interval_minutes` | Kaç dakikada bir reklam kuşağı |
| `is_active` | Profil aktif mi |

`radio_profile_assets`

Radyo profiline local hidden jingle/ad dosyalarını bağlar.

```text
radio_profile_id + song_id + slot_type
slot_type = jingle veya ad
```

Sadece şu şarkılar bağlanabilir:

```text
source_type = local
visibility = hidden
asset_role = slot_type ile aynı
is_blocked != true
is_active != false
```

`radio_profile_playlist_stats`

Spotify playlist autoplay seçiminde "en az çalınanı çal" algoritması için per-profile istatistik tutar.

```text
radio_profile_id + spotify_uri -> play_count, last_played_at
```

### 6.5 Podcast tabloları

`podcast_feeds`

Admin tarafından eklenen RSS feed kaynaklarını tutar.

| Kolon | Anlam |
|---|---|
| `title` | Feed başlığı |
| `feed_url` | RSS XML URL |
| `is_active` | Aktif feed mi |
| `last_synced_at` | Son başarılı sync |
| `last_sync_error` | Son hata mesajı |

`podcast_episodes`

RSS item'lardan normalize edilmiş episode kayıtlarıdır.

Kimlik eşleştirme önceliği:

```text
guid
audio_url
episode_url
```

Program aynı episode'u tekrar görünce duplicate insert yerine canonical kaydı update eder.

### 6.6 Gamification tabloları

`user_points`

Uygulama içi geniş XP/puan cüzdanıdır. Jukebox rank sistemi ile karıştırılmamalıdır.

| Kolon | Anlam |
|---|---|
| `lifetime_points` | Tüm zaman uygulama puanı |
| `spendable_points` | Market harcanabilir puan |
| `monthly_points` | Aylık uygulama puanı |
| `listening_points` | Dinleme kaynaklı puan |
| `events_points` | Etkinlik/QR puanı |
| `games_points` | Oyun puanı |
| `social_points` | Sosyal/interaksiyon puanı |
| `jukebox_points` | Jukebox kategorisi |

`points_ledger`

Her puan hareketinin muhasebe kaydıdır. `awardUserPoints()` çağrısı hem `user_points` aggregate alanlarını günceller hem de buraya ledger satırı yazar.

`badges`, `user_badges`

Rozet tanımları ve kullanıcıya verilen rozetler.

`market_items`, `market_redemptions`

Market ürünleri ve kullanıcı redemption kayıtları. Ürün `stock_quantity` doluysa satın almada stok azaltılır.

`app_events`, `event_registrations`

Etkinlik tanımları ve kullanıcı kayıtları.

`qr_rewards`, `qr_reward_claims`

QR kod ile puan toplama sistemi. Kullanıcı aynı QR reward'ı bir kez claim edebilir.

`arcade_games`, `game_score_submissions`

Mobil mini oyun tanımları ve skor submission kayıtları.

Aktif oyun slug'ları:

```text
snake
memory
tetris
rhythm-tap
word-guess
```

`listening_sessions`

Radyo/podcast dinleme heartbeat kayıtlarıdır. Dinleme süresine göre puan verir.

`user_profile_customization`

Profil özelleştirme verilerini tutar:

```text
favorite_song_title
favorite_song_artist
favorite_song_spotify_uri
favorite_artist_name
favorite_artist_spotify_id
favorite_podcast_id
favorite_podcast_title
profile_headline
featured_badge_id
theme_key
```

### 6.7 Spotify tabloları

`spotify_app_config`

Admin panelden girilen Spotify Client ID/Secret değerlerini tutar. Env değerlerinin önüne geçer.

`spotify_auth`

Global okul Spotify hesabı OAuth token'ını tutar. Playlist okuma ve bazı global Spotify API işlemleri burada saklanan authorization ile yapılır.

`spotify_device_auth`

Cihaz bazlı Spotify OAuth bağlantısını tutar. Her kiosk kendi Spotify hesabıyla bağlanabilir. Bu, aynı anda birden fazla kiosk'un bağımsız müzik çalabilmesi için tasarlanmıştır.

## 7. Kimlik Doğrulama Akışı

### 7.1 Register

Endpoint:

```text
POST /api/v1/auth/register
```

Girdi:

```json
{
  "email": "user@example.com",
  "password": "min-6-char",
  "display_name": "Tuna Özsarı"
}
```

Program şunları yapar:

1. Zod ile email/password/display name validasyonu yapar.
2. Email'i lowercase ve trim eder.
3. Display name'i `normalizeText()` ile normalize eder. Mojibake olmuş Türkçe karakterleri tamir etmeye çalışır.
4. Email domain'i izinli mi kontrol eder.
5. Aynı email kayıtlı mı kontrol eder.
6. Password'ü bcrypt ile hash'ler.
7. `users` tablosuna role `user` ile kayıt açar.
8. Access token ve refresh token üretir.
9. Refresh token hash'ini `refresh_tokens` tablosuna yazar.
10. Kullanıcı ve token'ları döner.

### 7.2 Login

Endpoint:

```text
POST /api/v1/auth/login
```

Program:

1. Email ile kullanıcıyı bulur.
2. Bcrypt compare ile şifreyi doğrular.
3. `last_ip` ve `user_agent` alanlarını günceller.
4. Yeni access/refresh token üretir.
5. Kullanıcı profilini ve token'ları döner.

### 7.3 Guest login

Endpoint:

```text
POST /api/v1/auth/guest
```

Program:

1. Display name'i normalize eder.
2. `guest_xxxxx@radiotedu.internal` formatında random email üretir.
3. `password_hash=NULL`, `is_guest=true` kullanıcı kaydı açar.
4. Guest role ile JWT üretir.
5. Guest kullanıcıyı döner.

Guest sınırlamaları:

```text
Guest market item alamaz.
Guest etkinliğe register olamaz.
Guest QR reward claim edemez.
Guest oyun puanı kazanamaz.
Guest listening heartbeat puanı kazanamaz.
Guest supervote kullanamaz.
Guest günlük 1 şarkı ekleyebilir.
```

### 7.4 Refresh token

Endpoint:

```text
POST /api/v1/auth/refresh
```

Program:

1. Gelen refresh token JWT olarak verify edilir.
2. DB'deki hash'lenmiş refresh token kayıtlarıyla bcrypt compare yapılır.
3. Match bulunursa eski refresh token silinir.
4. Yeni access/refresh pair üretilir.
5. Yeni refresh hash'i DB'ye yazılır.

### 7.5 Auth middleware

`authMiddleware`:

```text
Authorization: Bearer <token> alır
  -> JWT verify eder
  -> req.user içine id/email/role koyar
  -> token yoksa veya geçersizse 401 döner
```

`optionalAuth`:

```text
Token varsa verify eder
Token yoksa isteği devam ettirir
Geçersiz token varsa da çoğu durumda req.user boş devam eder
```

## 8. Jukebox Şarkı Kataloğu

Katalog iki kaynaktan oluşur:

1. Local dosyalar: `backend/uploads/songs` altında saklanır, `songs.file_url` üzerinden servis edilir.
2. Spotify parçaları: Spotify API'den aranır, seçilince `songs` tablosuna lazy upsert edilir.

### 8.1 Şarkı arama

Endpoint:

```text
GET /api/v1/jukebox/songs?search=<query>
```

Program search varsa:

1. Local public şarkıları `title ILIKE` veya `artist ILIKE` ile arar.
2. Spotify Search API ile track arar.
3. Spotify sonuçlarını content filter'dan geçirir.
4. Spotify ve local sonuçları tek listede birleştirir.
5. Dönüşte her item'da source bilgisi vardır:

```json
{
  "id": null,
  "source_type": "spotify",
  "spotify_uri": "spotify:track:...",
  "title": "...",
  "artist": "...",
  "cover_url": "...",
  "file_url": null
}
```

Program search yoksa:

1. DB'deki public, aktif, engellenmemiş şarkıları döner.
2. Spotify veya local fark etmez, katalog item formatına map eder.

### 8.2 Content filter

`backend/src/services/contentFilter.ts`

Aktif filtreler:

1. `SpotifyExplicitFilter`: Spotify `explicit=true` olan track'i reddeder.
2. `BlacklistFilter`: `songs.is_blocked`, `blocked_artists.spotify_artist_id` veya artist name üzerinden engellenmiş şarkı/sanatçıyı reddeder.

### 8.3 Local upload

Endpoint:

```text
POST /api/v1/jukebox/admin/upload-song
```

Program:

1. Multer ile dosyayı alır.
2. Dosya adını normalize eder.
3. `Artist - Title.ext` formatından artist/title parse eder.
4. Dosyayı canonical path'e taşır.
5. Duplicate varsa tekrar eklemez.
6. Önceden inactive kayıt varsa re-active eder.
7. Metadata sync dener.
8. `songs` kaydı döner.

### 8.4 Folder scan

Endpoint:

```text
POST /api/v1/jukebox/admin/scan-folder
```

Program:

1. `uploads/songs` klasörünü tarar.
2. `.mp3`, `.m4a`, `.wav` dosyalarını işler.
3. `song-upload-` prefix'li geçici dosyaları atlar.
4. Mojibake veya unsafe filename varsa normalize eder ve dosyayı rename eder.
5. DB kaydı yoksa insert eder.
6. DB kaydı inactive ise active eder.
7. Eski bozuk file_url ile yeni normalize file_url çakışıyorsa reconcile eder.

## 9. Text Encoding / Türkçe Karakter Tamiri

`backend/src/utils/textNormalization.ts` projenin Türkçe karakter karışması sorununa karşı yazılmıştır.

Program:

1. String'i trim eder.
2. Unicode NFC normalize eder.
3. Suspicious mojibake karakterleri arar:
   - `├`
   - `▒`
   - `Ã`
   - `Ä`
   - `Å`
   - replacement character vb.
4. Latin1 -> UTF-8 ve CP850 -> UTF-8 adayları üretir.
5. En düşük "bozukluk skoru" olan adayı seçer.

Kullanıldığı yerler:

```text
auth display_name normalize
local filename normalize
scan-folder title/artist parse
upload canonical filename
repair:text script
```

Bu mekanizma yeni veri girişlerinde sorunu azaltır. Var olan DB kayıtları için `npm run repair:text` script'i vardır.

## 10. Jukebox Cihaz Bağlantısı

### 10.1 Kiosk register

Endpoint:

```text
POST /api/v1/jukebox/kiosk/register
```

Girdi:

```json
{
  "device_code": "KAFE-01",
  "password": "optional"
}
```

Program:

1. `devices.device_code` ile cihazı bulur.
2. Cihazda password varsa gelen password ile karşılaştırır.
3. Doğruysa `is_active=true`, `last_heartbeat=NOW()` yapar.
4. Kiosk'a device objesini döner.

### 10.2 Kullanıcı cihaz bağlanma

Endpoint:

```text
POST /api/v1/jukebox/connect
```

Girdi:

```json
{
  "device_code": "KAFE-01",
  "password": "optional"
}
```

Program:

1. Aktif cihazı bulur.
2. Mevcut queue state'i yükler.
3. Kullanıcı token'ı varsa `device_sessions` içine `user_id + device_id` yazar.
4. Device ve queue döner.

Not: Kodda `password` body'den okunuyor ama connect route içinde password doğrulama akışı aktif görünmüyor. Kiosk register password kontrol ediyor. Kullanıcı connect tarafında da password zorunlu olacaksa bu ayrıca güçlendirilmeli.

### 10.3 Device session kontrolü

Şarkı ekleme ve oy verme route'ları `checkDeviceSession` kullanır.

Program:

```text
device_id yoksa 400
user yoksa 401
user admin ise devam
device_sessions içinde user_id + device_id yoksa 403 SESSION_REQUIRED
varsa devam
```

Bu, kullanıcıların bağlanmadıkları cihazın kuyruğunu değiştirmesini engeller.

## 11. Şarkı Sıraya Ekleme Akışı

Endpoint:

```text
POST /api/v1/jukebox/queue
```

Girdi iki formdan biri olabilir:

Spotify:

```json
{
  "device_id": "uuid",
  "spotify_uri": "spotify:track:..."
}
```

Local:

```json
{
  "device_id": "uuid",
  "song_id": "uuid"
}
```

Program adım adım:

1. JWT zorunlu olduğu için kullanıcıyı alır.
2. `device_sessions` ile kullanıcının cihaza bağlı olduğunu doğrular.
3. `users` tablosundan role/is_guest bilgilerini alır.
4. Kullanıcı admin değilse aktif pending şarkı sayısını kontrol eder.
5. Normal user için aynı cihazda maksimum 5 pending şarkıya izin verir.
6. Guest ise `x-guest-fingerprint` header'ına göre günlük limit kontrolü yapar.
7. Seçilen şarkıyı çözer:
   - `spotify_uri` geldiyse Spotify API'den track metadata alır ve `songs` tablosuna upsert eder.
   - `song_id` geldiyse DB'den local/spotify şarkıyı bulur.
8. Normal kullanıcı hidden local asset eklemeye çalışırsa reddeder.
9. Aynı şarkı aynı cihazda pending durumdaysa normal kullanıcıya izin vermez.
10. Aynı şarkı son 15 dakika içinde çalındıysa normal kullanıcıya izin vermez.
11. `queue_items` içine `status=pending`, `queue_reason=user/admin`, `priority_score` ile kayıt açar.
12. Eğer şarkı Spotify ise, cihazda aktif Spotify playback target varsa ve queue boşsa hemen başlatmayı dener.
13. Kullanıcının ekleme istatistiklerini günceller:
    - Şarkı ekleyen registered kullanıcı rank kazanır.
    - Guest için günlük sayaç artırılır.
14. Socket.IO ile `device:{device_id}` odasına `queue_updated` gönderir.
15. Eklenen queue item'ı döner.

## 12. Jukebox Oy ve Puan Sistemi

Bu projede iki farklı puan kavramı vardır:

1. Şarkı puanı: Queue item ve songs.score üzerinde, sıradaki/çalan şarkının oylama skorudur.
2. Kişi rank puanı: `users.rank_score` ve `user_monthly_rank_scores` üzerinde, kullanıcı sıralamasına giren puandır.

### 12.1 Oy değerleri

`backend/src/services/jukeboxScoring.ts` içinde tanımlı değerler:

| Oy | Şarkı puanı etkisi | Şarkıyı ekleyen kişinin rank etkisi |
|---|---:|---:|
| Upvote | +1 | +1 |
| Downvote | -1 | -1 |
| Supervote | +3 | +2 |
| Oy kaldırma | Önceki oyun ters etkisi | Önceki etkinin ters etkisi |

Sıraya şarkı ekleme ayrıca kullanıcıya rank puanı kazandırır. Projenin ürün mantığına göre amaç hesap açmayı teşvik etmektir; guest kullanıcı sınırlıdır, registered kullanıcı hem daha çok işlem yapar hem de rank kazanır.

### 12.2 Vote endpoint

Endpoint:

```text
POST /api/v1/jukebox/vote
```

Girdi:

```json
{
  "device_id": "uuid",
  "queue_item_id": "uuid",
  "vote": 1,
  "is_super": false
}
```

veya now-playing fallback için:

```json
{
  "device_id": "uuid",
  "song_id": "uuid",
  "vote": -1,
  "is_super": false
}
```

Program:

1. JWT ve device session kontrol eder.
2. User'ı DB'den okur.
3. `is_super=true` ise:
   - Guest ise reddeder.
   - Kullanıcının bugün supervote kullandığını görürse reddeder.
   - Uygunsa `last_super_vote_at=NOW()` yapar.
4. Queue item'a daha önce oy verilmiş mi bakar.
5. Aynı oy tekrar verilirse vote kaldırma mantığına dönebilir.
6. `votes` tablosunu insert/update/delete eder.
7. Queue item için upvote/downvote toplamlarını tekrar hesaplar.
8. `songs.score` alanını delta kadar günceller.
9. Şarkıyı ekleyen kişinin rank delta'sını uygular.
10. Queue item'ın `priority_score`, `upvotes`, `downvotes` alanlarını günceller.
11. Net skor -5 veya altına düşerse:
    - Pending ise `skipped` yapar ve `song_rejected` yayınlar.
    - Playing ise `skipped` yapar, device current song'u temizler ve `song_skipped` yayınlar.
12. Her durumda `queue_updated` yayınlar.

### 12.3 -5 otomatik silme/skip mantığı

`buildQueueVoteSkipDecision()` net song score <= -5 olduğunda devreye girer.

```text
pending item:
  status=skipped
  kullanıcı/kiosk visible queue'dan düşer
  socket song_rejected

playing item:
  status=skipped
  devices.current_song_id=NULL
  socket song_skipped
  kiosk sonraki şarkıya geçmeye çalışır
```

## 13. Queue Okuma ve Görünürlük

Endpoint:

```text
GET /api/v1/jukebox/queue/:deviceId
```

Program:

1. Device queue item'larını status ve priority'ye göre yükler.
2. `playing` item varsa `now_playing` yapar.
3. `devices.current_song_id` dolu ama playing queue item yoksa current song fallback oluşturur.
4. Pending queue'da `queue_reason=jingle` veya `ad` olanları gizler.
5. Dönüş:

```json
{
  "now_playing": {},
  "queue": []
}
```

Playback descriptor her item'a eklenir:

```json
{
  "source_type": "spotify",
  "playback_type": "spotify",
  "spotify_uri": "spotify:track:...",
  "file_url": null,
  "asset_role": "music"
}
```

veya:

```json
{
  "source_type": "local",
  "playback_type": "local",
  "spotify_uri": null,
  "file_url": "/uploads/songs/file.mp3",
  "asset_role": "jingle"
}
```

## 14. Kiosk Playback Akışı

Kiosk uygulaması `kiosk-web/app.js` üzerinden çalışır.

### 14.1 Başlatma

Kiosk sayfası açılınca:

1. `CONFIG.DEVICE_CODE` URL query veya localStorage'dan okunur.
2. Device code yoksa setup overlay gösterilir.
3. Device code varsa `/api/v1/jukebox/kiosk/register` çağrılır.
4. Socket.IO bağlantısı kurulur.
5. `join_device` ile `device:{id}` odasına katılır.
6. İlk queue `/api/v1/jukebox/queue/:deviceId` ile çekilir.
7. Spotify device auth status kontrol edilir.
8. Kullanıcı etkileşimi overlay'i ile browser autoplay kısıtları aşılır.
9. Sırada veya now playing'de şarkı varsa çalma başlar.

### 14.2 Local şarkı çalma

Kiosk bir local item alınca:

1. `KioskPlayback.getSongPlaybackPlan()` çağrılır.
2. `file_url` relative ise `CONFIG.API_URL + file_url` yapılır.
3. Spotify playback varsa pause edilir.
4. HTML `<audio>` elementine `src` atanır.
5. `audio.play()` çağrılır.
6. Başarılıysa `/api/v1/jukebox/kiosk/now-playing` ile `song_id` backend'e bildirilir.
7. Progress bar ve socket `playback_progress` başlar.

### 14.3 Spotify şarkı çalma

Kiosk bir Spotify item alınca:

1. Kiosk device auth bağlı mı kontrol eder.
2. Spotify Web Playback SDK yüklenir.
3. Backend'den `/api/v1/jukebox/kiosk/spotify-token?device_id=...` ile cihazın Spotify access token'ı alınır.
4. Spotify Player oluşturulur.
5. SDK `ready` event'inde Spotify playback device id alınır.
6. Kiosk bu device id'yi `/api/v1/jukebox/kiosk/spotify-device` ile backend'e kaydeder.
7. Şarkı başlatmak için `/api/v1/jukebox/kiosk/now-playing` çağrılır.
8. Backend `dispatchSpotifyPlaybackForSong()` ile Spotify Web API üzerinden ilgili Spotify playback device'a play komutu yollar.
9. SDK state change ile track progress takip edilir.
10. Track bitişi algılanınca kiosk `handleSpotifyTrackEnded()` üzerinden sıradaki parçaya geçer.

### 14.4 Şarkı bitişi

Local audio `ended` veya Spotify track ended olduğunda:

1. Kiosk backend'e `song_id=null` ile `/kiosk/now-playing` gönderir.
2. Backend cihazın `current_song_id` alanını temizler.
3. Playing queue item varsa `played` yapar.
4. Eğer biten item normal müzikse jingle/reklam insert mantığını çalıştırır.
5. `queue_updated` yayınlar.
6. Kiosk queue'da sıradaki item varsa onu çalar.
7. Queue boşsa `/autoplay/trigger` çağırır.

## 15. Radyo Profili, Jingle, Reklam ve Autoplay

Radyo profili sistemi `backend/src/services/radioProfiles.ts` ve `routes/radioProfiles.ts` içinde çalışır.

### 15.1 Effective config

Program cihaz için effective config'i şöyle üretir:

```text
device.radio_profile_id ile profil bulunur
  -> profile.autoplay_spotify_playlist_uri alınır
  -> profile.jingle_every_n_songs alınır
  -> profile.ad_break_interval_minutes alınır

device.override_enabled=false ise:
  effective = profile değerleri

device.override_enabled=true ise:
  override alanı doluysa override kullanılır
  override alanı null ise profile fallback kullanılır
```

### 15.2 Jingle mantığı

Kural:

```text
Her N normal müzikten sonra jingle pool'dan 1 rastgele jingle çal.
```

Program:

1. Biten item normal müzik mi kontrol eder:
   - `queue_reason` user/admin/autoplay olmalı.
   - `asset_role=music` olmalı.
2. Bu cihazda played normal müzik sayısını hesaplar.
3. `completedMusicCount % jingle_every_n_songs === 0` ise jingle çalıştırır.
4. Profilin `radio_profile_assets` jingle pool'undan random 1 song seçer.
5. `queue_items` içine `queue_reason=jingle` ile pending kayıt açar.
6. Visible queue'da göstermez.

### 15.3 Reklam kuşağı mantığı

Kural:

```text
Her ad_break_interval_minutes dakikada bir reklam kuşağı girer.
Kuşağa atanan kaç reklam varsa hepsini çalar.
```

Program:

1. Effective config'te `ad_break_interval_minutes` var mı bakar.
2. `devices.last_ad_break_at` yoksa reklam kuşağına izin verir.
3. Son reklamdan geçen süre yeterliyse reklam kuşağına izin verir.
4. Profilin ad pool'undaki tüm reklamları sıraya ekler.
5. Her kayıt `queue_reason=ad` olur.
6. `devices.last_ad_break_at=NOW()` yapılır.
7. Reklamlar visible queue'da görünmez.

Öncelik sırası:

```text
Reklam kuşağı zamanı geldiyse reklamlar girer.
Reklam yoksa/ zamanı gelmediyse jingle kuralı değerlendirilir.
```

### 15.4 Spotify playlist autoplay

Kural:

```text
Queue boşsa cihazın effective radio profile playlistinden otomatik şarkı seç.
Tam random değil, en az çalınan track'i seç.
Eşit play_count varsa random seç.
```

Program:

1. `/autoplay/trigger` çağrılır.
2. Queue'da pending item varsa autoplay reddedilir.
3. Effective config yüklenir.
4. `autoplay_spotify_playlist_uri` yoksa local fallback random public music seçilir.
5. Playlist varsa Spotify API ile playlist items çekilir.
6. Explicit/blocklist filter uygulanır.
7. `radio_profile_playlist_stats` içinden playlist track'lerinin play_count değerleri alınır.
8. En düşük play_count'a sahip track'ler bulunur.
9. Eşitler arasında random seçim yapılır.
10. Seçilen Spotify track `songs` tablosuna upsert edilir.
11. `queue_items` içine `queue_reason=autoplay`, `autoplay_radio_profile_id=...` ile pending eklenir.
12. Queue update yayınlanır.
13. Kiosk yeni pending item'ı çalar.
14. Playback başlayınca `recordAutoplayPlaybackStart()` play_count'u artırır.

Spotify playlist fetch başarısız olursa veya uygun track yoksa local public music fallback denenir.

## 16. Spotify Entegrasyonu

Spotify iki seviyede kullanılır:

1. Global Spotify auth: Admin/okul hesabı. Playlist okuma ve global API çağrıları için.
2. Device Spotify auth: Her kiosk cihazının kendi Spotify hesabı. Aynı anda bağımsız playback için.

### 16.1 App config

Admin endpoint:

```text
GET /api/v1/spotify/app-config
PUT /api/v1/spotify/app-config
```

Program:

1. Önce `spotify_app_config` tablosunda client id/secret var mı bakar.
2. Yoksa `.env` içindeki `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` değerlerini kullanır.
3. `SPOTIFY_REDIRECT_URI` env'den gelir ve read-only döner.
4. Client id/secret değişirse `spotify_auth` ve `spotify_device_auth` kayıtları silinir. Bu doğru davranıştır; eski tokenlar yeni app credentials ile geçersiz hale gelir.

### 16.2 Gerekli Spotify scopes

`backend/src/services/spotify.ts` içinde required scopes:

```text
streaming
user-modify-playback-state
user-read-playback-state
user-read-currently-playing
user-read-email
user-read-private
playlist-read-private
playlist-read-collaborative
```

Spotify Web Playback SDK ve playback control için Spotify Premium hesap gerekir.

### 16.3 Global auth

Endpoint:

```text
GET /api/v1/spotify/auth
GET /api/v1/spotify/callback
GET /api/v1/spotify/status
POST /api/v1/spotify/refresh
```

Program:

1. Admin `/auth` çağırır.
2. Backend Spotify authorize URL'e redirect eder.
3. Spotify `/callback?code=...` döner.
4. Backend code'u token'a çevirir.
5. `spotify_auth` tablosunu temizleyip tek aktif token kaydı yazar.
6. Token süresi dolmaya yakın otomatik refresh edilir.

### 16.4 Device auth

Endpoint:

```text
GET /api/v1/spotify/device-auth/start?device_id=...
GET /api/v1/spotify/device-auth/callback
GET /api/v1/spotify/device-auth/status?device_id=...
DELETE /api/v1/spotify/device-auth/:deviceId
```

Kiosk tarafında ayrıca:

```text
GET /api/v1/jukebox/kiosk/spotify-token?device_id=...
POST /api/v1/jukebox/kiosk/spotify-device-auth/status
GET/POST /api/v1/jukebox/kiosk/spotify-device-auth/start
POST /api/v1/jukebox/kiosk/spotify-device
```

Program:

1. Device auth start çağrısında backend signed state üretir:
   - format: `device.<deviceId>.<nonce>.<signature>`
   - signature HMAC SHA256 ile client secret üzerinden üretilir.
2. Spotify callback geldiğinde state verify edilir.
3. Device id DB'de var mı kontrol edilir.
4. Token exchange yapılır.
5. `/me` çağrısıyla Spotify account bilgileri alınır.
6. `spotify_device_auth` tablosuna access token, refresh token, account id, product, country yazılır.
7. Kiosk token istediğinde device auth kaydından access token döner, gerekirse refresh eder.
8. Kiosk Spotify SDK ready olunca Spotify playback device id'yi backend'e bildirir.
9. Backend playback dispatch yaparken `devices.spotify_playback_device_id` değerini hedef olarak kullanır.

## 17. Admin Jukebox İşlemleri

Admin route'ları `routes/jukebox.ts` içinde `/admin/...` prefix'i ile yer alır.

Önemli endpointler:

| Endpoint | Görev |
|---|---|
| `GET /admin/devices` | Cihazları queue/current song bilgisiyle listeler |
| `POST /admin/devices` | Yeni cihaz oluşturur |
| `PUT /admin/devices/:id` | Cihaz adı, konum, şifre gibi alanları günceller |
| `POST /admin/devices/:id/logout-all` | O cihaza bağlı kullanıcı session'larını siler, socket force_logout gönderir |
| `POST /admin/skip` | Çalan şarkıyı skipped yapar ve kiosk'a song_skipped yollar |
| `GET /admin/songs` | Tüm şarkıları listeler |
| `POST /admin/upload-song` | Local şarkı upload eder |
| `POST /admin/scan-folder` | Upload klasörünü tarar |
| `PATCH /admin/songs/:id/classification` | Local şarkıyı public/hidden ve music/jingle/ad olarak sınıflandırır |
| `DELETE /admin/songs/:id` | Şarkıyı inactive/blocked mantığıyla listeden çıkarır |
| `POST /admin/songs/:id/block` | Şarkıyı blocklist'e alır |
| `DELETE /admin/songs/:id/block` | Şarkı block'unu kaldırır |
| `POST /admin/artists/block` | Sanatçıyı blocklist'e alır |
| `DELETE /admin/artists/:id/block` | Sanatçı block'unu kaldırır |
| `GET /admin/blocked` | Blocked song/artist listesi |

Radyo profili admin route'ları ayrı dosyadadır:

| Endpoint | Görev |
|---|---|
| `GET /api/v1/radio-profiles` | Profilleri listeler |
| `POST /api/v1/radio-profiles` | Profil oluşturur |
| `GET /api/v1/radio-profiles/:id` | Profil ve asset'leri döner |
| `PUT /api/v1/radio-profiles/:id` | Profil ayarlarını günceller |
| `DELETE /api/v1/radio-profiles/:id` | Profil siler |
| `POST /api/v1/radio-profiles/:id/assets` | Profile jingle/ad asset ekler |
| `DELETE /api/v1/radio-profiles/:id/assets/:songId/:slotType` | Asset çıkarır |
| `PUT /api/v1/radio-profiles/devices/:deviceId/profile` | Cihaza profil atar |
| `PUT /api/v1/radio-profiles/devices/:deviceId/override` | Cihaz override ayarlarını günceller |

Mevcut web admin ekranında cihaz, Spotify app/device ve şarkı yönetimi bulunur. Radyo profili backend endpointleri mevcut fakat web controller tarafında bu yönetimin UI kapsamı sınırlı/görünmüyor. Bu, canlı operasyon için ya API ile yönetilmeli ya da admin UI'ye eklenmelidir.

## 18. Podcast Sistemi

Podcast sistemi RSS feed tabanlıdır. WordPress snippet veya dış özel API gerektirmez.

### 18.1 Admin RSS feed ekleme

Endpoint:

```text
POST /api/v1/podcast-feeds
```

Program:

1. Admin auth + RBAC kontrol eder.
2. `title`, `feed_url`, `is_active` alır.
3. Duplicate feed URL varsa reddeder.
4. `podcast_feeds` içine kaydeder.
5. Ekledikten sonra sync çalıştırır.
6. Feed ve sync sonucunu döner.

### 18.2 Feed sync

Endpoint:

```text
POST /api/v1/podcast-feeds/sync
```

Program:

1. Aktif feedleri alır.
2. Her feed için advisory lock alır. Böylece aynı feed aynı anda iki kez sync olmaz.
3. RSS XML'i axios ile 15 saniye timeout ile indirir.
4. `fast-xml-parser` ile parse eder.
5. `rss.channel.item` listesini normalize eder.
6. Her item için:
   - guid
   - link
   - enclosure audio URL
   - title
   - description
   - itunes:image veya image
   - pubDate
   - author
   - itunes:duration
   alanlarını çıkarır.
7. Audio URL yoksa item skip edilir.
8. Existing episode'ları guid/audio_url/episode_url ile bulur.
9. Duplicate varsa canonical row seçer, fazla duplicate kayıtları siler.
10. Var olan canonical row'u update eder veya yeni kayıt insert eder.
11. Feed `last_synced_at` ve `last_sync_error` güncellenir.

### 18.3 Mobil podcast listeleme

Endpoint:

```text
GET /api/v1/podcasts?page=1&per_page=10
```

Program:

1. Aktif feedlere bağlı episode'ları sayar.
2. Published date desc, created date desc sıralar.
3. `items`, `total`, `total_pages` döner.
4. Mobil `PodcastScreen` bu listeyi çeker.
5. Kullanıcı episode'a basınca `audio_url` varsa onu açar; yoksa external URL fallback kullanır.

Mevcut mobil podcast ekranı in-app listeler. Podcast oynatma mimarisi daha ileri bir aşamada TrackPlayer ile tam entegre edilebilir. Şu an servis `resolvePodcastLaunchUrl()` ile audio/external URL seçimi yapar.

## 19. Gamification Sistemi

Gamification API'leri auth zorunlu çalışır. Guest kullanıcı bazı listeleri görebilir ama puan kazandıran işlemler registered account ister.

### 19.1 Current gamification profile

Endpoint:

```text
GET /api/v1/gamification/me
```

Program:

1. Kullanıcıyı `users` üzerinden alır.
2. `user_points` ile join eder.
3. Kullanıcı temel bilgileri ve points objesi döner.

### 19.2 Home summary

Endpoint:

```text
GET /api/v1/gamification/home
```

Program:

1. Kullanıcının puanlarını alır.
2. İlk 5 aktif etkinliği alır.
3. İlk 5 aktif oyunu alır.
4. İlk 5 aktif market ürününü alır.
5. Mobil ana sayfaya tek payload döner.

### 19.3 Market

Endpoint:

```text
GET /api/v1/gamification/market
POST /api/v1/gamification/market/:itemId/redeem
```

Redeem programı:

1. Guest ise 403 döner.
2. Ürün aktif mi kontrol eder.
3. Stok varsa stok > 0 mı kontrol eder.
4. Kullanıcının `spendable_points` değerini alır.
5. Puan yetmiyorsa 400 döner.
6. Transaction açar.
7. `spendable_points` azaltır.
8. Stoklu ürünse `stock_quantity` azaltır.
9. `market_redemptions` içine `pending` kayıt açar.
10. Yeni spendable points ile redemption döner.

### 19.4 Events

Endpoint:

```text
GET /api/v1/gamification/events
POST /api/v1/gamification/events/:eventId/register
GET /api/v1/gamification/events/my-tickets
POST /api/v1/gamification/events/qr/claim
```

Register:

```text
Guest reddedilir.
event_registrations içine user_id + event_id yazılır.
Aynı kullanıcı tekrar register olursa status registered yapılır.
```

QR claim:

```text
code alınır
active/time-valid qr_rewards bulunur
daha önce claim edilmişse unique constraint 409 verir
qr_reward_claims kaydı açılır
awardUserPoints(category=events) çağrılır
```

### 19.5 Games

Endpoint:

```text
GET /api/v1/gamification/games
POST /api/v1/gamification/games/:gameId/score
```

Mobil oyun skor payload contract:

```json
{
  "score": 120,
  "client_round_id": "snake-171...",
  "play_duration_ms": 45000,
  "submission_source": "mobile_game"
}
```

Backend şu an skor endpoint'inde sadece `score` alanını aktif kullanıyor; `client_round_id`, `play_duration_ms`, `submission_source` verileri mobil contract'ta var ama DB insert şu an sadece game_id/user_id/score/points_awarded yazıyor. Daha güçlü anti-cheat ve audit için bu alanların DB'ye eklenmesi gerekir.

Puan hesaplama:

```text
calculated = floor(score * point_rate)
points_awarded = min(calculated, daily_point_limit - awarded_today)
```

Puan verildiyse:

```text
awardUserPoints(category=games, sourceType=arcade_game)
game_score_submissions insert
```

### 19.6 Listening heartbeat

Endpoint:

```text
POST /api/v1/gamification/listening/heartbeat
```

Girdi:

```json
{
  "content_type": "radio",
  "content_id": "radiotedu-main",
  "content_title": "RadioTEDU",
  "listened_seconds": 900
}
```

Program:

1. Guest ise 403 döner.
2. `listened_seconds` normalize edilir.
3. Puan: `min(10, floor(listened_seconds / 300))`
4. `listening_sessions` kaydı açılır.
5. Puan > 0 ise `awardUserPoints(category=listening)` çağrılır.

## 20. Rank ve Leaderboard

Leaderboard endpoint:

```text
GET /api/v1/users/leaderboard?period=total|monthly&category=total|listening|events|games|social|jukebox
```

Program:

1. `period` normalize edilir. Default `total`.
2. `category` normalize edilir. Default `total`.
3. İstanbul timezone ile current `YYYY-MM` hesaplanır.
4. Query seçilir:
   - total + total category: `users.rank_score`
   - monthly + total category: `user_monthly_rank_scores`
   - total + specific category: `user_points.<category>_points`
   - monthly + specific category: `points_ledger` üzerinde ay ve kategori filtreli SUM
5. Guest ve admin kullanıcılar listeden çıkarılır.
6. İlk 50 kullanıcı döner.

Burada dikkat edilmesi gereken ayrım:

```text
users.rank_score:
  Jukebox/rank sisteminin ana skoru.

user_points.lifetime_points:
  Geniş uygulama gamification puanı.

points_ledger:
  Geniş uygulama puan hareketlerinin audit kaydı.
```

`awardUserPoints()` şu an `user_points` güncellerken aynı zamanda `users.rank_score` ve monthly rank score da artırır. Bu yüzden oyun/dinleme/etkinlik puanları da genel rank'a etki eder. Jukebox vote/add işlemleri ise ayrı servislerle rank puanı günceller.

## 21. Mobil Uygulama

Mobil uygulama React Native 0.76.9 kullanır.

Ana bağımlılıklar:

```text
React Navigation
AsyncStorage
axios
react-native-track-player
socket.io-client
zustand
react-native-vector-icons
```

### 21.1 Navigation

`mobile/src/navigation/RootNavigator.tsx`

Ana tablar:

| Tab | Screen |
|---|---|
| Home | `HomeScreen` |
| Radio | `RadioScreen` |
| Podcasts | `PodcastScreen` |
| Jukebox | `JukeboxScreen` |
| Leaderboard | `LeaderboardScreen` |

Stack ekranları:

```text
Profile
Events
Games
Market
SnakeGame
MemoryGame
TetrisGame
RhythmTapGame
WordGuessGame
Auth/Login/Register
```

### 21.2 AuthContext

`mobile/src/context/AuthContext.tsx`

Program:

1. App açılışında AsyncStorage'dan `access_token` okur.
2. Token varsa `/auth/me` çağırır.
3. Kullanıcı dönerse context'e yazar.
4. Login/register/guestLogin işlemleri ilgili auth endpointleri çağırır.
5. Token'ları AsyncStorage'a kaydeder.
6. Logout tokenları siler.

### 21.3 API config

`mobile/src/services/api.ts`

Axios instance:

```text
baseURL = BASE_API
timeout = 15000
Content-Type = application/json
request interceptor -> AsyncStorage access_token -> Authorization Bearer
```

### 21.4 RadioScreen

`mobile/src/data/radioChannels.ts` statik radyo kanallarını tutar:

```text
radiotedu-main
radiotedu-classic
radiotedu-jazz
radiotedu-lofi
```

`RadioScreen`:

1. Favori kanal id'lerini AsyncStorage'dan yükler.
2. Kanalları favoriler ve kalanlar olarak sıralar.
3. TrackPlayer queue'sunu radyo stream URL'leriyle hazırlar.
4. Kullanıcı kanal seçince TrackPlayer skip/play yapar.
5. Kalite low/medium/high stream URL'si seçebilir.
6. Dinleme geçmişi modalı için `/radio/history/:channelId` çağırır.

Önemli gap: Backend `routes/radio.ts` içinde `/history/:channelId` endpoint'i şu an yok. Mobil bu çağrı hata alabilir. Radio history canlı kullanılacaksa backend endpoint eklenmelidir.

### 21.5 PodcastScreen

Program:

1. `/podcasts?page=N&per_page=10` çağırır.
2. Gelen episode'ları normalize eder.
3. Sonsuz/çok sayfalı liste mantığıyla yeni sayfa yükler.
4. Kullanıcı episode'a basınca audio URL veya external URL açılır.

### 21.6 JukeboxScreen

`mobile/src/screens/jukebox/JukeboxScreen.tsx`

Program:

1. Aktif cihazları `/jukebox/devices` ile çeker.
2. Cihaz kodu ile `/jukebox/connect` çağırır.
3. Socket.IO ile device room'a katılır.
4. `queue_updated`, `song_skipped` eventlerini dinler.
5. Şarkı araması için `/jukebox/songs?search=...` çağırır.
6. Seçili şarkıyı `buildQueueSongSelectionPayload()` ile `song_id` veya `spotify_uri` olarak gönderir.
7. `/jukebox/queue` ile sıraya ekler.
8. Pending ve now playing item'lara upvote/downvote/supervote gönderebilir.
9. Supervote hakkını `last_super_vote_at` ve İstanbul günü ile client-side hesaplar.
10. Guest kullanıcıya hesap açma teşvikleri gösterir.

### 21.7 GamesScreen ve oyunlar

`GamesScreen`:

1. `/gamification/games` çağırır.
2. Backend'den gelen `game.slug` değerini `gameRoutes.ts` ile route'a çevirir.
3. `Play` butonu ilgili gerçek oyun ekranına navigate eder.
4. Random demo score üretmez.

Slug-route mapping:

| Slug | Screen |
|---|---|
| `snake` | `SnakeScreen` |
| `memory` | `MemoryGameScreen` |
| `tetris` | `TetrisScreen` |
| `rhythm-tap` | `RhythmTapScreen` |
| `word-guess` | `WordGuessScreen` |

Her oyun kendi içinde oynanır, oyun bitince `submitMobileGameScore()` çağrılır.

Score submission:

```text
createClientRoundId(game)
buildGameScorePayload(score, clientRoundId, startedAt)
submitGameScore(game.id, payload)
```

### 21.8 ProfileScreen

Profile ekranı:

1. Auth user stats gösterir.
2. Profil favorilerini `/profile/me` ile çeker.
3. Kullanıcı headline, favori şarkı, favori sanatçı, favori podcast alanlarını kaydedebilir.
4. Rozetleri gösterir.
5. Admin ise podcast feed yönetim arayüzü de içerir:
   - feed listele
   - feed ekle
   - sync
   - delete

Podcast feed admin arayüzünün mobil profile içine yerleşmesi operasyonel olarak çalışır ama uzun vadede admin panelde ayrı sayfa yapılması daha temiz olur.

## 22. Kiosk Web Uygulaması

Kiosk statik HTML/CSS/JS uygulamasıdır.

Ana dosyalar:

| Dosya | Görev |
|---|---|
| `index.html` | Kiosk UI |
| `style.css` | Görsel tasarım |
| `config.js` | API/socket/device URL config |
| `app.js` | Ana kiosk state machine |
| `playback.js` | Local/Spotify playback plan helper |
| `spotify-player.js` | Spotify SDK wrapper |
| `device-spotify-auth.js` | Kiosk Spotify bağlantı overlay/controller |
| `branding.js` | Logo/fallback yönetimi |

### 22.1 Branding

`branding.js`:

1. `brandLogoImage` yüklenirse logo görüntülenir.
2. Logo yüklenemezse `RadioTEDU` text fallback görünür.
3. Bu, sol üstte yazı yerine logo kullanma isteğine uygun şekilde tasarlanmıştır.

Mevcut asset:

```text
kiosk-web/assets/logo-03byz-scaled.png
```

### 22.2 Queue rendering

Kiosk visible queue listesinde sadece backend'in döndürdüğü visible queue gösterilir. Bu yüzden reklam ve jingle backend tarafından gizlendiği için sırada görünmez. Kiosk ilk 6 item'ı listeler, vote score'u up/down olarak gösterir.

### 22.3 Autoplay tetikleme

Kiosk iki durumda `/autoplay/trigger` çağırır:

1. Çalan şarkı %80'i geçti ve visible queue boşsa.
2. Şarkı bittiğinde queue boşsa.

Bu sayede şarkı bitmeden backend bir sonraki autoplay item'ı hazırlayabilir.

### 22.4 Heartbeat ve reconciliation

Kiosk socket üzerinden periyodik `kiosk_heartbeat` gönderir. Backend socket handler:

1. `reconcileStoppedSpotifyPlaybackForDevice()` çağırır.
2. Spotify state ile backend state sapmışsa düzeltmeye çalışır.
3. Heartbeat event'ini room'a tekrar yayınlar.

## 23. Web Controller

`jukebox-web-controller` Vite React uygulamasıdır.

### 23.1 Runtime config

`src/runtimeConfig.ts`:

```text
Development:
  apiRoot = http://hostname:3000 + publicBasePath
  socketUrl = http://hostname:3000

Production:
  apiRoot = window.origin + publicBasePath
  socketUrl = window.origin

VITE_API_ORIGIN varsa:
  api origin override edilir.
```

### 23.2 Kullanıcı arayüzü

`src/App.tsx`:

1. Guest login veya admin/user login yapar.
2. Device code ile `/jukebox/connect` çağırır.
3. Socket.IO ile queue update dinler.
4. Search input ile `/jukebox/songs?search=` çağırır.
5. Search result key için `song.id`, `spotify_uri` ve fallback key kullanır. Bu, React duplicate key sorunlarını azaltır.
6. Şarkı eklerken Spotify ise `spotify_uri`, local ise `song_id` gönderir.
7. Pending ve now-playing oylarını `/jukebox/vote` ile gönderir.
8. Supervote availability client-side gösterilir.
9. Leaderboard `/users/leaderboard` ile çekilir.

### 23.3 Admin dashboard

`src/AdminDashboard.tsx`:

1. Admin token ile cihazları listeler.
2. Cihaz oluşturur/günceller.
3. Admin skip yapar.
4. Cihazdaki tüm user session'ları force logout yapar.
5. Şarkı listesi, upload, scan folder, delete işlemlerini yapar.
6. Spotify app config'i okur/yazar.
7. Cihaz bazlı Spotify auth status gösterir.
8. Spotify device auth start/disconnect akışını yönetir.

Admin dashboard mevcut haliyle jukebox operasyonunun ana panelidir. Radyo profile ve gamification admin CRUD ekranları backend'de var olan bütün domainleri kapsayacak kadar geniş değildir.

## 24. Socket.IO Olayları

Socket setup:

```text
Client connects
  -> join_device(deviceId)
  -> room = device:<deviceId>
```

Aktif eventler:

| Event | Yön | Görev |
|---|---|---|
| `join_device` | client -> server | Cihaz room'una katılır |
| `leave_device` | client -> server | Cihaz room'undan çıkar |
| `queue_updated` | server -> clients | Queue/now playing güncellendi |
| `song_skipped` | server -> clients | Çalan şarkı skip edildi |
| `song_rejected` | server -> clients | Pending şarkı -5 threshold ile reddedildi |
| `force_logout` | server -> clients | Admin o cihazdaki session'ları bitirdi |
| `playback_progress` | kiosk -> server -> clients | Çalma progress yayını |
| `kiosk_heartbeat` | kiosk -> server -> clients | Kiosk canlılık ve Spotify reconciliation |

## 25. API Özet Kataloğu

### Auth

| Method | Path | Auth | Görev |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Yok | Registered user oluşturur |
| POST | `/api/v1/auth/login` | Yok | User login |
| POST | `/api/v1/auth/guest` | Yok | Guest user oluşturur |
| POST | `/api/v1/auth/refresh` | Refresh token | Token yeniler |
| GET | `/api/v1/auth/me` | Bearer | Current profile |
| POST | `/api/v1/auth/upload-avatar` | Bearer | Avatar upload |

### Jukebox user/kiosk

| Method | Path | Auth | Görev |
|---|---|---|---|
| POST | `/api/v1/jukebox/connect` | Optional | Cihaza bağlanır |
| POST | `/api/v1/jukebox/disconnect` | Bearer | Cihaz session siler |
| GET | `/api/v1/jukebox/devices` | Yok | Aktif cihaz listesi |
| GET | `/api/v1/jukebox/songs` | Yok | Katalog/Spotify arama |
| POST | `/api/v1/jukebox/queue` | Bearer + session | Sıraya şarkı ekler |
| POST | `/api/v1/jukebox/vote` | Bearer + session | Oy verir |
| GET | `/api/v1/jukebox/queue/:deviceId` | Optional | Queue state |
| POST | `/api/v1/jukebox/kiosk/register` | Yok | Kiosk cihazı active eder |
| POST | `/api/v1/jukebox/kiosk/now-playing` | Kiosk | Playback state update |
| POST | `/api/v1/jukebox/autoplay/trigger` | Kiosk | Autoplay item üretir |

### Spotify

| Method | Path | Auth | Görev |
|---|---|---|---|
| GET | `/api/v1/spotify/auth` | Admin | Global Spotify OAuth start |
| GET | `/api/v1/spotify/callback` | Yok | Spotify callback |
| GET | `/api/v1/spotify/status` | Admin | Global auth status |
| POST | `/api/v1/spotify/refresh` | Admin | Token refresh |
| GET | `/api/v1/spotify/app-config` | Admin | Spotify app config oku |
| PUT | `/api/v1/spotify/app-config` | Admin | Spotify app config yaz |
| GET | `/api/v1/spotify/device-auth/start` | Admin | Device OAuth start |
| GET | `/api/v1/spotify/device-auth/callback` | Yok | Device callback |
| GET | `/api/v1/spotify/device-auth/status` | Admin | Device auth status |
| DELETE | `/api/v1/spotify/device-auth/:deviceId` | Admin | Device auth sil |

### Podcast

| Method | Path | Auth | Görev |
|---|---|---|---|
| GET | `/api/v1/podcasts` | Yok | Episode listesi |
| GET | `/api/v1/podcast-feeds` | Admin | Feed listesi |
| POST | `/api/v1/podcast-feeds` | Admin | Feed ekle ve sync |
| POST | `/api/v1/podcast-feeds/sync` | Admin | Feed sync |
| DELETE | `/api/v1/podcast-feeds/:id` | Admin | Feed sil |

### Gamification

| Method | Path | Auth | Görev |
|---|---|---|---|
| GET | `/api/v1/gamification/me` | Bearer | Puan profili |
| GET | `/api/v1/gamification/home` | Bearer | Home summary |
| GET | `/api/v1/gamification/market` | Bearer | Market listesi |
| POST | `/api/v1/gamification/market/:itemId/redeem` | Registered | Market redemption |
| GET | `/api/v1/gamification/events` | Bearer | Etkinlik listesi |
| GET | `/api/v1/gamification/events/my-tickets` | Bearer | Biletlerim |
| POST | `/api/v1/gamification/events/:eventId/register` | Registered | Etkinlik kayıt |
| POST | `/api/v1/gamification/events/qr/claim` | Registered | QR reward claim |
| GET | `/api/v1/gamification/games` | Bearer | Aktif oyunlar |
| POST | `/api/v1/gamification/games/:gameId/score` | Registered | Oyun skoru |
| POST | `/api/v1/gamification/listening/heartbeat` | Registered | Dinleme puanı |

### Profile / users

| Method | Path | Auth | Görev |
|---|---|---|---|
| GET | `/api/v1/profile/me` | Bearer | Profil favorileri + badges |
| PUT | `/api/v1/profile/me` | Registered | Profil özelleştirme |
| PUT | `/api/v1/profile/favorites` | Registered | Favori alanları güncelle |
| GET | `/api/v1/users/leaderboard` | Yok | Leaderboard |
| GET | `/api/v1/users/:id/stats` | Yok | Public user stats |

## 26. Deployment ve Env Değerleri

Backend için önemli env değerleri:

| Env | Görev |
|---|---|
| `PORT` | Backend portu, default 3000 |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SSL` | `true` ise SSL aktif |
| `JWT_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `PUBLIC_BASE_PATH` | Subdirectory publish için örn. `/jukebox` |
| `SPOTIFY_CLIENT_ID` | Spotify app client id fallback |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret fallback |
| `SPOTIFY_REDIRECT_URI` | Spotify callback URL |
| `RADIO_STREAM_URL` | `/radio/status` fallback stream URL |

Canlı subdirectory deployment için kritik beklenen değerler:

```text
PUBLIC_BASE_PATH=/jukebox
SPOTIFY_REDIRECT_URI=https://radiotedu.com/jukebox/api/v1/spotify/callback
```

Spotify Developer Dashboard redirect URI de aynı olmalıdır:

```text
https://radiotedu.com/jukebox/api/v1/spotify/callback
```

Device auth callback route'u aynı callback üzerinden signed `state` ile ayrıştırılabilir. Ayrıca backend içinde device callback helper path'i de vardır:

```text
/api/v1/spotify/device-auth/callback
```

## 27. Güvenlik ve Yetki Modeli

Mevcut güvenlik katmanları:

1. JWT auth.
2. Refresh token rotation.
3. Admin RBAC middleware.
4. Device session kontrolü.
5. Guest günlük şarkı limiti.
6. Supervote günlük limit.
7. Content filtering.
8. Rate limit: 60 saniyede 500 request.
9. Helmet aktif, CSP kapalı.
10. CORS `origin: '*'`.

Operasyonel güvenlik notları:

1. Production'da `JWT_SECRET` ve `JWT_REFRESH_SECRET` default değerlerle bırakılmamalıdır.
2. CORS şu an herkese açık. Public API için kabul edilebilir olabilir ama admin işlemleri bearer token'a bağlı olduğu için token sızıntısı riskinde etki büyür.
3. Admin endpointleri role kontrolü kullanıyor fakat bazı kiosk endpointleri intentionally auth'suz. Bu endpointler device id/password mantığıyla korunmalı.
4. Kiosk device register password kontrol ediyor. User connect route password'u okumakta ama doğrulama yapmıyor gibi görünüyor.
5. Spotify client secret DB'de plaintext tutuluyor. Bu pratik olarak çalışır ama DB erişimi olan herkes Spotify app secret'ı görür.
6. Upload edilen audio dosyaları static servis ediliyor. Dosya türü ve boyut politikalarının production'da sıkı tutulması gerekir.

## 28. Test Kapsamı

Repository'de test dosyaları vardır:

Backend:

```text
src/routes/*.test.ts
src/services/*.test.ts
src/contracts/*.test.ts
src/utils/*.test.ts
src/db/migrate.test.ts
```

Özellikle kapsanan alanlar:

```text
device scoped Spotify auth
gamification
jukebox automation
guest limit
playback dispatch
queue visibility
queue contract
search
vote scoring
podcast feeds
podcasts
profile
radio profiles
Spotify app config/callback/service
text normalization
leaderboard
```

Kiosk web:

```text
branding.test.js
device-spotify-auth.test.js
playback.test.js
spotify-player.test.js
```

Web controller:

```text
runtimeConfig.test.ts
jukeboxCatalog.test.ts
nowPlayingVotes.test.ts
guestFingerprint.test.ts
adminSpotifyConfig.test.ts
```

Mobile:

`mobile/__tests__` altında podcast feed admin ve ilgili servis testleri bulunur.

Bu rapor hazırlanırken test suite çalıştırılmadı; doküman kaynak kod incelemesine dayanır. Dokümantasyon değişikliği sonrası minimum doğrulama olarak markdown dosyasının git diff kontrolü yeterlidir. Kod değişikliği yapılırsa ilgili package testleri ayrıca çalıştırılmalıdır.

## 29. Bilinen Teknik Riskler ve Gap'ler

Bu bölüm özellikle önemlidir. Projeyi devralacak kişinin hangi alanların tam üretim seviyesinde, hangi alanların dikkat istediğini bilmesi gerekir.

### 29.1 Schema drift: users kolonları

Kod şu kolonları kullanıyor:

```text
users.last_ip
users.user_agent
users.last_super_vote_at
```

Mevcut `backend/src/db/schema.sql` içindeki `CREATE TABLE users` tanımında bu kolonlar görünmüyor. Fresh DB kurulursa register/login/supervote akışları hata verebilir. Canlı DB'de çalışıyorsa bu kolonlar muhtemelen daha önce elle veya eski migration ile eklenmiştir. Kalıcı çözüm: `schema.sql` içine `ALTER TABLE users ADD COLUMN IF NOT EXISTS ...` satırları eklenmelidir.

### 29.2 Mobile RadioScreen history endpoint eksik

Mobil `RadioScreen` şu endpoint'i çağırıyor:

```text
GET /api/v1/radio/history/:channelId
```

Backend `routes/radio.ts` içinde şu an sadece:

```text
GET /status
GET /schedule
```

vardır. History modalı gerçek veri gösterecekse backend endpoint eklenmelidir.

### 29.3 Radio status mock listener count

`/api/v1/radio/status` içinde listener count şu an random üretiliyor:

```text
Math.floor(Math.random() * 50) + 10
```

Canlı listener sayısı gerekiyorsa Icecast/Shoutcast veya mevcut stream provider stats API'si bağlanmalıdır.

### 29.4 Game score anti-cheat/audit eksik

Mobil game score payload içinde `client_round_id`, `play_duration_ms`, `submission_source` var. Backend endpoint şu an skor insert'inde bu alanları kaydetmiyor. Profesyonel gamification için:

```text
client_round_id unique olmalı
play_duration_ms saklanmalı
submission_source saklanmalı
çok kısa sürede yüksek skor anti-cheat kontrolünden geçmeli
oyun bazlı skor limitleri metadata'dan uygulanmalı
```

### 29.5 Admin UI kapsamı backend kapsamından dar

Backend'de radio profile, assets, device override, gamification domainleri var. Web admin dashboard bunların tamamını kapsamıyor. Bazı işlemler mobil profile admin alanına veya doğrudan API'ye kalmış durumda.

### 29.6 Spotify playback operasyonel bağımlılığı

Spotify Web Playback SDK ve playback API için Premium gerekir. Her bağımsız kiosk kendi Spotify hesabı ile bağlanmalıysa her kiosk hesabının Premium olması gerekir. Aynı Spotify hesabı birden fazla cihazda eşzamanlı bağımsız playback için uygun değildir.

### 29.7 Encoding problemi azaltılmış ama eski veriler için repair gerekebilir

Yeni display name ve filename akışları normalize ediliyor. Ancak eski DB kayıtları hala mojibake içeriyorsa `repair:text` script'i veya manuel veri düzeltme gerekir.

## 30. Yeni Özellik Eklemek İçin Rehber

### 30.1 Yeni mobil oyun eklemek

1. DB'de `arcade_games` içine yeni slug/title/point_rate/daily_point_limit ekle.
2. `mobile/src/screens/games/NewGameScreen.tsx` oluştur.
3. `mobile/src/screens/games/gameRoutes.ts` içine slug-route map ekle.
4. `RootNavigator.tsx` içine Stack.Screen ekle.
5. Oyun bitince `submitMobileGameScore()` çağır.
6. Backend'de anti-cheat gerekiyorsa `/gamification/games/:gameId/score` genişlet.

### 30.2 Yeni podcast feed eklemek

Admin API:

```text
POST /api/v1/podcast-feeds
Authorization: Bearer admin-token
{
  "title": "Program Adı",
  "feed_url": "https://example.com/rss.xml",
  "is_active": true
}
```

Program feed'i kaydeder ve sync dener. Mobil `/podcasts` üzerinden episode'ları görür.

### 30.3 Yeni kiosk cihazı eklemek

1. Admin panelden veya API ile cihaz oluştur:

```text
POST /api/v1/jukebox/admin/devices
```

2. Kiosk URL:

```text
https://radiotedu.com/jukebox/kiosk?code=CIHAZ-KODU&pwd=CIHAZ-SIFRESI
```

3. Kiosk Spotify gerekiyorsa Spotify bağla akışı tamamlanır.
4. Kullanıcılar QR/link üzerinden aynı cihaz koduna bağlanır.

### 30.4 Yeni jingle/reklam eklemek

1. Local audio upload et veya `uploads/songs` klasörüne koyup scan-folder çalıştır.
2. Admin classification ile:
   - jingle için `visibility=hidden`, `asset_role=jingle`
   - reklam için `visibility=hidden`, `asset_role=ad`
3. `radio_profile_assets` endpointiyle ilgili profile ekle.
4. Profile ayarlarında `jingle_every_n_songs` veya `ad_break_interval_minutes` belirle.

### 30.5 Yeni radyo profili eklemek

```text
POST /api/v1/radio-profiles
{
  "name": "Oryantasyon",
  "autoplay_spotify_playlist_uri": "spotify:playlist:...",
  "jingle_every_n_songs": 5,
  "ad_break_interval_minutes": 30,
  "is_active": true
}
```

Sonra cihaza ata:

```text
PUT /api/v1/radio-profiles/devices/:deviceId/profile
{
  "radio_profile_id": "profile-uuid"
}
```

## 31. Örnek Uçtan Uca Senaryolar

### 31.1 Kullanıcı Spotify şarkısı ekler

```text
Mobilde kullanıcı kiosk seçer
  -> POST /jukebox/connect
  -> device_sessions kaydı oluşur

Kullanıcı arama yapar
  -> GET /jukebox/songs?search=...
  -> backend Spotify Search API çağırır
  -> explicit/blocklist filtreler
  -> sonuç döner

Kullanıcı şarkıyı ekler
  -> POST /jukebox/queue { device_id, spotify_uri }
  -> backend Spotify track metadata alır
  -> songs upsert
  -> queue_items pending insert
  -> user rank/add stats güncellenir
  -> queue_updated socket yayılır

Kiosk queue_updated alır
  -> queue boşsa item'ı playSong ile başlatır
  -> Spotify item olduğu için playSpotifySong
  -> /kiosk/now-playing { device_id, song_id }
  -> backend Spotify playback device'a play komutu verir
  -> queue item playing olur
  -> clients now_playing görür
```

### 31.2 Şarkı -5 downvote alır

```text
Kullanıcı downvote atar
  -> POST /jukebox/vote
  -> votes upsert
  -> upvotes/downvotes tekrar hesaplanır
  -> net score -5 olduysa skip decision oluşur

Pending ise:
  -> status skipped
  -> song_rejected socket
  -> visible queue'dan düşer

Playing ise:
  -> status skipped
  -> current_song_id NULL
  -> song_skipped socket
  -> kiosk playback durdurup sonraki şarkıya geçmeye çalışır
```

### 31.3 Queue boşalınca playlist autoplay

```text
Kiosk şarkının bittiğini bildirir
  -> /kiosk/now-playing song_id=null
  -> backend playing item'ı played yapar
  -> jingle/reklam kuralı çalışır
  -> queue update döner

Queue hala boşsa kiosk:
  -> POST /jukebox/autoplay/trigger
  -> backend effective radio profile yükler
  -> Spotify playlist tracklerini çeker
  -> block/explicit filtreler
  -> radio_profile_playlist_stats ile en az çalınanı seçer
  -> songs upsert
  -> queue_items autoplay pending insert
  -> queue_updated socket

Kiosk:
  -> yeni pending item'ı çalar
```

### 31.4 Podcast feed eklenir

```text
Admin feed URL girer
  -> POST /podcast-feeds
  -> backend feed'i kaydeder
  -> syncPodcastFeed çalışır
  -> RSS indirilir
  -> episode'lar normalize edilir
  -> duplicate merge edilir
  -> podcast_episodes güncellenir

Mobil:
  -> GET /podcasts
  -> yeni bölümleri listeler
```

### 31.5 Mobil oyun puanı

```text
Mobil GamesScreen açılır
  -> GET /gamification/games
  -> aktif oyunlar listelenir

Kullanıcı Snake oynar
  -> SnakeScreen içinde gerçek oyun state'i çalışır
  -> oyun biter
  -> score hesaplanır
  -> POST /gamification/games/:gameId/score

Backend:
  -> registered account mı kontrol eder
  -> daily limit hesaplar
  -> awardUserPoints(category=games)
  -> game_score_submissions insert
  -> score ve awarded points döner
```

## 32. Kısa Sonuç

Projenin çekirdeği tek backend ve tek PostgreSQL veritabanı üzerine kuruludur. Jukebox sistemi tek queue modeliyle çalışır; local müzik, Spotify müzik, jingle, reklam ve autoplay aynı `queue_items` tablosundan yönetilir. Kiosk playback state'i backend'e bildirir, backend de Socket.IO ile bütün istemcileri güncel tutar. Mobil uygulama artık sadece radyo/podcast değil, oyun, etkinlik, market, profil ve leaderboard ile gamification yüzü de taşır.

Projeyi devralacak bir geliştiricinin en kritik dikkat noktaları şunlardır:

1. Fresh DB kurulumu öncesi schema drift kontrol edilmeli.
2. Radio history ve full admin UI eksikleri kapatılmalı.
3. Game score endpoint'i anti-cheat/audit için genişletilmeli.
4. Spotify device auth/Premium hesabı operasyonel olarak her kiosk için planlanmalı.
5. Subdirectory deployment için backend, mobile ve web runtime config aynı `/jukebox` mantığında tutulmalı.
