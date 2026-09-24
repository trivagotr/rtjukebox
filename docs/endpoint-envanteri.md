# Backend endpoint envanteri

Envanter, `backend/src/server.ts` mount'ları ve `backend/src/routes/*.ts` tanımlarını; istemci bağlantısı için `mobile/src`, `jukebox-web-controller/src` ve `kiosk-web` kaynaklarını tarayarak güncellenmiştir. Route parametreleri `:id` biçiminde gösterilir. “Bağlı” ifadesi kaynakta çağrı bulunduğunu belirtir; canlı ortamda erişilebilirlik veya deployment ayarını kanıtlamaz.

## Mount ve alias davranışı

- HTTP API'nin tek kanonik kökü `/api/v1`'dir. `PUBLIC_BASE_PATH` API route'larına eklenmez; kiosk/controller statik dosyaları, health route'u ve Socket.IO path'i için kullanılır.
- Eski `/jukebox/kiosk/*` yolu doğrudan router'a girmez; herhangi bir HTTP metoduyla gelen istek `308` ile `/api/v1/jukebox/kiosk/*` yoluna yönlendirilir. Diğer `/jukebox/*` API alias'ı yoktur.
- `/api/v1/radio-profiles/*` yalnız `RADIO_PROFILES_ENABLED=true` iken mount edilir; varsayılan kapalıdır.
- Aşağıdaki `/api/v1` rotaları `server.ts` içindeki router mount'larından türetilmiştir.

## Kaynakta tanımlı HTTP API

| Kaynak / mount | Metot ve tam yollar | İstemci kullanımı |
|---|---|---|
| `auth` | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/guest`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`, `POST /api/v1/auth/upload-avatar` | register mobil; login/guest mobil ve web controller; refresh mobil API interceptor; me ve avatar mobil |
| `podcasts` | `GET /api/v1/podcasts` | Mobil |
| `podcast-feeds` | `GET /api/v1/podcast-feeds`, `POST /api/v1/podcast-feeds`, `POST /api/v1/podcast-feeds/sync`, `DELETE /api/v1/podcast-feeds/:id` | Mobil Profile/feed yönetim servisi; backend router'ı admin auth + role guard + rate limit uygular |
| `radio` | `GET /api/v1/radio/status`, `GET /api/v1/radio/schedule`, `GET /api/v1/radio/history/:channelId` | Yalnız history GET için mobil çağrı bulundu. Status/schedule çağrısı bulunmadı |
| `profile` | `GET /api/v1/profile/me`, `PUT /api/v1/profile/me`, `PUT /api/v1/profile/favorites` | Mobil |
| `users` | `GET /api/v1/users/leaderboard` | Mobil ve web controller |
| `gamification` | `GET /api/v1/gamification/me`, `GET /api/v1/gamification/home`, `GET /api/v1/gamification/market`, `GET /api/v1/gamification/events`, `GET /api/v1/gamification/events/my-tickets`, `GET /api/v1/gamification/games`, `POST /api/v1/gamification/market/:itemId/redeem`, `POST /api/v1/gamification/events/:eventId/register`, `POST /api/v1/gamification/events/qr/claim`, `POST /api/v1/gamification/games/:gameId/score`, `POST /api/v1/gamification/listening/heartbeat` | Mobil gamification servisleri/ekranları |
| `jukebox` — kullanıcı | `POST /api/v1/jukebox/connect`, `POST /api/v1/jukebox/disconnect`, `GET /api/v1/jukebox/devices`, `GET /api/v1/jukebox/songs`, `POST /api/v1/jukebox/queue`, `POST /api/v1/jukebox/vote`, `GET /api/v1/jukebox/queue/:deviceId`, `GET /api/v1/jukebox/lyrics`, `POST /api/v1/jukebox/autoplay/trigger` | Mobil, web controller ve kiosk; autoplay/lyrics kiosk tarafından çağrılır |
| `jukebox` — admin işlemleri | `POST /api/v1/jukebox/admin/devices/:id/provision`, `POST /api/v1/jukebox/admin/devices/:id/logout-all`, `POST /api/v1/jukebox/admin/skip`, `POST /api/v1/jukebox/admin/sync-metadata`, `GET /api/v1/jukebox/admin/songs`, `PATCH /api/v1/jukebox/admin/songs/:id/classification`, `POST /api/v1/jukebox/admin/scan-folder`, `POST /api/v1/jukebox/admin/upload-song`, `DELETE /api/v1/jukebox/admin/songs/:id`, `GET /api/v1/jukebox/admin/devices`, `POST /api/v1/jukebox/admin/devices`, `PUT /api/v1/jukebox/admin/devices/:id`, `GET /api/v1/jukebox/admin/spotify-devices`, `PUT /api/v1/jukebox/admin/devices/:id/spotify-playback-target`, `GET /api/v1/jukebox/admin/playlist-preview`, `POST /api/v1/jukebox/admin/process-song` | Web controller; classification, Spotify alias ve bazı yönetim route'ları için taranan UI'da çağrı bulunmadı. Admin route grubu merkezi admin guard + rate limit arkasında |
| `jukebox` — moderasyon | `GET /api/v1/jukebox/admin/moderation/settings`, `PUT /api/v1/jukebox/admin/moderation/settings`, `GET /api/v1/jukebox/admin/moderation/keywords`, `POST /api/v1/jukebox/admin/moderation/keywords`, `DELETE /api/v1/jukebox/admin/moderation/keywords/:id`, `POST /api/v1/jukebox/admin/moderation/test` | Web controller |
| `jukebox` — blocklist | `POST /api/v1/jukebox/admin/songs/:id/block`, `DELETE /api/v1/jukebox/admin/songs/:id/block`, `POST /api/v1/jukebox/admin/artists/block`, `DELETE /api/v1/jukebox/admin/artists/:id/block`, `GET /api/v1/jukebox/admin/blocked` | Taranan istemcilerde çağrı bulunmadı; merkezi admin guard arkasında |
| `jukebox` — kiosk | `POST /api/v1/jukebox/kiosk/register`, `POST /api/v1/jukebox/kiosk/spotify-token`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/status`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/start`, `POST /api/v1/jukebox/kiosk/spotify-device`, `GET /api/v1/jukebox/kiosk/playback-state/:deviceId`, `POST /api/v1/jukebox/kiosk/now-playing` | Kiosk web |
| `spotify` | `GET /api/v1/spotify/auth`, `GET /api/v1/spotify/callback`, `GET /api/v1/spotify/status`, `POST /api/v1/spotify/device-auth/start`, `GET /api/v1/spotify/device-auth/callback`, `GET /api/v1/spotify/device-auth/status`, `DELETE /api/v1/spotify/device-auth/:deviceId`, `GET /api/v1/spotify/app-config`, `PUT /api/v1/spotify/app-config`, `POST /api/v1/spotify/refresh`, `GET /api/v1/spotify/playback-devices` | Web controller çağrıları: device-auth start/status, app-config, playback-devices. OAuth callback'leri Spotify yönlendirmesidir. Diğerlerinde doğrudan UI çağrısı bulunmadı |
| `radio-profiles` — opsiyonel mount | `GET /api/v1/radio-profiles`, `POST /api/v1/radio-profiles`, `GET /api/v1/radio-profiles/:id`, `PUT /api/v1/radio-profiles/:id`, `DELETE /api/v1/radio-profiles/:id`, `POST /api/v1/radio-profiles/:id/assets`, `DELETE /api/v1/radio-profiles/:id/assets/:songId/:slotType`, `PUT /api/v1/radio-profiles/devices/:deviceId/profile`, `PUT /api/v1/radio-profiles/devices/:deviceId/override` | İstemci çağrısı bulunmadı; mount flag'i açık olduğunda router admin guard uygular |

## Route olmayan HTTP/static yüzeyler

- `GET /health` ve yapılandırılmışsa `GET {PUBLIC_BASE_PATH}/health`: basit health yanıtı.
- `GET /favicon.ico`, `GET /.well-known/appspecific/com.chrome.devtools.json`: 204 dönen utility route'ları.
- `/controller` statik build ve `GET /controller/*` SPA fallback; `/kiosk` statik web dosyaları; `/uploads` statik yükleme dosyaları.
- Socket.IO, REST endpointi değildir. Path varsayılan `/socket.io`; `PUBLIC_BASE_PATH` ile yapılandırılabilir.

## Kaldırılan yollar

- Genel `/jukebox/*` router alias'ı kaldırıldı; yalnız eski `/jukebox/kiosk/*` istekleri kanonik kiosk API'sine 308 yönlendirilir.
- `GET /api/v1/jukebox/kiosk/spotify-token` kaldırıldı; token yalnız POST ile istenir.
- `GET /api/v1/jukebox/kiosk/spotify-device-auth/start` ve `GET /api/v1/spotify/device-auth/start` kaldırıldı; iki start akışı POST kullanır. Kiosk credential query string'e konmaz.
- İstemciden yazılabilir `POST /api/v1/radio/history/:channelId` kaldırıldı; history yazımı sunucu içi watcher/service tarafından yapılır.
- `GET /api/v1/users/:id/stats` kaldırıldı; kaynakta istemci çağrısı bulunmadı ve IDOR riski taşıyordu.

## Canlı doğrulama ve kapsam

`docs/verification-2026-06-24.md` içinde 2026-09-23 tarihli smoke kaydı vardır; yalnız orada listelenen register, jukebox, gamification, QR, leaderboard ve podcast akışlarını kapsar. Buradaki envanter kaynak kodu taramasıdır; her endpoint için canlı smoke yapıldığı anlamına gelmez. İstemci eşleştirmesi statik API çağrılarını kapsar; runtime URL'leri ve production feature flag/deployment ayarları ayrıca doğrulanmalıdır.
