# Backend endpoint envanteri

Bu liste `backend/src/server.ts` içindeki mount'lar ve `backend/src/routes` içindeki tüm HTTP route tanımlarına göre hazırlanmıştır. İstemci eşleşmesi için `mobile/src`, `jukebox-web-controller/src` ve `kiosk-web` kaynakları taranmıştır. “Bağlı” istemcide çağrı bulunduğunu, “bağlanmayan” taranan istemcilerde çağrı bulunmadığını belirtir; canlı erişilebilirlik iddiası değildir. Parametreler `:id` biçiminde gösterilmiştir.

`/api/v1` route'larının başına yapılandırılmış `PUBLIC_BASE_PATH` eklenebilir. Jukebox router'ı ayrıca yalnızca `/jukebox` altında da mount edilir; böylece kiosk API yollarının kısa alias'ları `/jukebox/...` biçiminde de vardır.

## Bağlı endpointler

| HTTP metodu ve endpoint | İstemci |
|---|---|
| `POST /api/v1/auth/register` | Mobil |
| `POST /api/v1/auth/login` | Mobil, web controller |
| `POST /api/v1/auth/guest` | Mobil, web controller |
| `POST /api/v1/auth/refresh` | Mobil API interceptor |
| `GET /api/v1/auth/me` | Mobil |
| `POST /api/v1/auth/upload-avatar` | Mobil |
| `GET /api/v1/podcasts` (router root `/`) | Mobil |
| `GET /api/v1/podcast-feeds` (router root `/`) | Mobil |
| `POST /api/v1/podcast-feeds` | Mobil |
| `POST /api/v1/podcast-feeds/sync` | Mobil |
| `DELETE /api/v1/podcast-feeds/:id` | Mobil |
| `GET /api/v1/radio/history/:channelId` | Mobil |
| `GET /api/v1/profile/me`, `PUT /api/v1/profile/me`, `PUT /api/v1/profile/favorites` | Mobil |
| `GET /api/v1/users/leaderboard` | Mobil, web controller |
| `GET /api/v1/gamification/me`, `GET /api/v1/gamification/home`, `GET /api/v1/gamification/market`, `GET /api/v1/gamification/events`, `GET /api/v1/gamification/events/my-tickets`, `GET /api/v1/gamification/games` | Mobil |
| `POST /api/v1/gamification/market/:itemId/redeem`, `POST /api/v1/gamification/events/:eventId/register`, `POST /api/v1/gamification/events/qr/claim`, `POST /api/v1/gamification/games/:gameId/score`, `POST /api/v1/gamification/listening/heartbeat` | Mobil |
| `POST /api/v1/jukebox/connect`, `POST /api/v1/jukebox/disconnect`, `GET /api/v1/jukebox/devices`, `GET /api/v1/jukebox/songs`, `POST /api/v1/jukebox/queue`, `POST /api/v1/jukebox/vote`, `GET /api/v1/jukebox/queue/:deviceId` | Mobil, web controller, kiosk (ilgili çağrılar) |
| `POST /api/v1/jukebox/admin/devices/:id/logout-all`, `POST /api/v1/jukebox/admin/skip`, `POST /api/v1/jukebox/admin/sync-metadata`, `GET /api/v1/jukebox/admin/songs`, `POST /api/v1/jukebox/admin/scan-folder`, `POST /api/v1/jukebox/admin/upload-song`, `DELETE /api/v1/jukebox/admin/songs/:id`, `GET /api/v1/jukebox/admin/devices`, `POST /api/v1/jukebox/admin/devices`, `PUT /api/v1/jukebox/admin/devices/:id`, `PUT /api/v1/jukebox/admin/devices/:id/spotify-playback-target`, `GET /api/v1/jukebox/admin/playlist-preview`, `POST /api/v1/jukebox/admin/process-song` | Web controller |
| `GET /api/v1/jukebox/admin/moderation/settings`, `PUT /api/v1/jukebox/admin/moderation/settings`, `GET /api/v1/jukebox/admin/moderation/keywords`, `POST /api/v1/jukebox/admin/moderation/keywords`, `DELETE /api/v1/jukebox/admin/moderation/keywords/:id`, `POST /api/v1/jukebox/admin/moderation/test` | Web controller |
| `GET /api/v1/jukebox/lyrics`, `GET /api/v1/jukebox/kiosk/playback-state/:deviceId`, `POST /api/v1/jukebox/kiosk/register`, `GET /api/v1/jukebox/kiosk/spotify-token`, `POST /api/v1/jukebox/kiosk/spotify-token`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/status`, `GET /api/v1/jukebox/kiosk/spotify-device-auth/start`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/start`, `POST /api/v1/jukebox/kiosk/spotify-device`, `POST /api/v1/jukebox/kiosk/now-playing`, `POST /api/v1/jukebox/autoplay/trigger` | Kiosk web |
| `GET /api/v1/spotify/device-auth/start`, `GET /api/v1/spotify/device-auth/status`, `DELETE /api/v1/spotify/device-auth/:deviceId`, `GET /api/v1/spotify/app-config`, `PUT /api/v1/spotify/app-config`, `GET /api/v1/spotify/playback-devices` | Web controller |

## Bağlanmayan endpointler

| HTTP metodu ve endpoint | Not |
|---|---|
| `GET /health` | Operasyonel sağlık kontrolü; ürün istemcisi çağrısı bulunmadı. |
| `GET /api/v1/radio/status`, `GET /api/v1/radio/schedule`, `POST /api/v1/radio/history/:channelId` | İstemci çağrısı bulunmadı. History GET istemcide bağlıdır. |
| `GET /api/v1/radio-profiles`, `POST /api/v1/radio-profiles`, `GET /api/v1/radio-profiles/:id`, `PUT /api/v1/radio-profiles/:id`, `DELETE /api/v1/radio-profiles/:id`, `POST /api/v1/radio-profiles/:id/assets`, `DELETE /api/v1/radio-profiles/:id/assets/:songId/:slotType`, `PUT /api/v1/radio-profiles/devices/:deviceId/profile`, `PUT /api/v1/radio-profiles/devices/:deviceId/override` | Radio profilleri yönetim route'ları. |
| `GET /api/v1/users/:id/stats` | İstemci çağrısı bulunmadı. |
| `GET /api/v1/spotify/auth`, `GET /api/v1/spotify/callback`, `GET /api/v1/spotify/status`, `GET /api/v1/spotify/device-auth/callback`, `POST /api/v1/spotify/refresh` | Callback'ler Spotify yönlendirmesi içindir; diğerlerinde de UI çağrısı bulunmadı. |
| `PATCH /api/v1/jukebox/admin/songs/:id/classification` | İstemci çağrısı bulunmadı. |
| `POST /api/v1/jukebox/admin/songs/:id/block`, `DELETE /api/v1/jukebox/admin/songs/:id/block`, `POST /api/v1/jukebox/admin/artists/block`, `DELETE /api/v1/jukebox/admin/artists/:id/block`, `GET /api/v1/jukebox/admin/blocked` | Engelleme yönetimi; UI çağrısı bulunmadı. |
| `GET /api/v1/jukebox/admin/spotify-devices` | Bu alias yolu çağrılmıyor; web controller `/api/v1/spotify/playback-devices` çağırıyor. |

## Kaynaklarda tanımlı diğer HTTP route'ları

Aşağıdaki endpointler bu uygulamanın `/api/v1` API'si değildir veya Express router'larında statik route olarak tanımlanmamıştır; istemci endpointleriyle karışmaması için ayrı listelenmiştir:

- `GET /favicon.ico` ve `GET /.well-known/appspecific/com.chrome.devtools.json`: utility route'ları.
- `GET /controller/*`: web controller SPA fallback; ayrıca `/controller` statik dosyaları.
- `/kiosk` ve `/uploads`: statik dosya mount'ları.
- Socket.IO bağlantısı: HTTP REST endpointi değil, realtime taşıma.

## Canlı smoke kanıtı

`docs/verification-2026-06-24.md` dosyasındaki 2026-09-23 kaydı canlı smoke'ta register, jukebox connect/search, queue add, supervote, games list/score, QR ödül claim, leaderboard ve podcast listing akışlarının çalıştırıldığını bildiriyor. Diğer endpointler için bu kayıtta canlı smoke kanıtı yoktur.

## Kaynak karşılaştırması

Route dosyalarındaki HTTP tanımları metot ve tam yol üzerinden tarandı: 95 route tanımı bulundu, her biri bu envanterde karşılık buldu (router root `/` yolları mount yolu olarak normalize edildi). İstemci kaynakları `rg` ile çağrı ifadeleri bakımından tarandı.

## Sınırlama

Bu liste route tanımlarını ve statik istemci çağrılarını kapsar. Runtime'da üretilen URL'ler, feature flag'ler ve deployment'a özgü davranışlar ayrıca kontrol edilmelidir.






