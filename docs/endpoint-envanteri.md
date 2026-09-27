# Backend endpoint envanteri

Envanter, `backend/src/server.ts` mount'ları ve `backend/src/routes/*.ts` tanımlarını; istemci bağlantısı için `mobile/src`, `jukebox-web-controller/src` ve `kiosk-web` kaynaklarını tarayarak güncellenmiştir. Route parametreleri `:id` biçiminde gösterilir. “Bağlı” ifadesi kaynakta çağrı bulunduğunu belirtir; canlı ortamda erişilebilirlik veya deployment ayarını kanıtlamaz.

## Mount ve alias davranışı

- HTTP API'nin tek kanonik kökü `/api/v1`'dir. `PUBLIC_BASE_PATH` API route'larına eklenmez; health uçları, kiosk/controller statik dosyaları ve Socket.IO için alias sağlar.
- Eski `/jukebox/kiosk/*` yolu doğrudan router'a girmez; herhangi bir HTTP metoduyla gelen istek `308` ile `/api/v1/jukebox/kiosk/*` yoluna yönlendirilir. Diğer `/jukebox/*` API alias'ı yoktur.
- `/api/v1/radio-profiles/*` yalnız `RADIO_PROFILES_ENABLED=true` iken mount edilir; varsayılan kapalıdır.
- Aşağıdaki `/api/v1` rotaları `server.ts` içindeki router mount'larından türetilmiştir.

## Kaynakta tanımlı HTTP API

| Kaynak / mount | Metot ve tam yollar | İstemci kullanımı |
|---|---|---|
| `auth` | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/guest`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/upload-avatar` | register mobil; login/guest mobil ve web controller; refresh mobil API interceptor; logout web controller; me ve avatar mobil, controller me cookie auth |
| `podcasts` | `GET /api/v1/podcasts` | Mobil |
| `podcast-feeds` | `GET /api/v1/podcast-feeds`, `POST /api/v1/podcast-feeds`, `POST /api/v1/podcast-feeds/sync`, `DELETE /api/v1/podcast-feeds/:id` | Mobil Profile/feed yönetim servisi; backend router'ı admin auth + role guard + rate limit uygular |
| `radio` | `GET /api/v1/radio/status`, `GET /api/v1/radio/schedule`, `GET /api/v1/radio/history/:channelId` | Yalnız history GET için mobil çağrı bulundu. Status/schedule çağrısı bulunmadı |
| `profile` | `GET /api/v1/profile/me`, `PATCH /api/v1/profile/me`, `PATCH /api/v1/profile/favorites` | Mobil |
| `users` | `GET /api/v1/users/leaderboard` | Mobil ve web controller |
| `gamification` | `GET /api/v1/gamification/me`, `GET /api/v1/gamification/home`, `GET /api/v1/gamification/market`, `GET /api/v1/gamification/events`, `GET /api/v1/gamification/events/my-tickets`, `GET /api/v1/gamification/games`, `POST /api/v1/gamification/market/:itemId/redeem`, `POST /api/v1/gamification/events/:eventId/register`, `POST /api/v1/gamification/events/qr/claim`, `POST /api/v1/gamification/games/:gameId/score`, `POST /api/v1/gamification/listening/heartbeat` | Mobil gamification servisleri/ekranları |
| `jukebox` — kullanıcı | `POST /api/v1/jukebox/connect`, `POST /api/v1/jukebox/disconnect`, `GET /api/v1/jukebox/devices`, `GET /api/v1/jukebox/songs`, `POST /api/v1/jukebox/queue`, `POST /api/v1/jukebox/vote`, `GET /api/v1/jukebox/queue/:deviceId`, `GET /api/v1/jukebox/lyrics`, `POST /api/v1/jukebox/autoplay/trigger` | Mobil, web controller ve kiosk; autoplay/lyrics kiosk tarafından çağrılır |
| `jukebox` — admin işlemleri | `POST /api/v1/jukebox/admin/devices/:id/provision`, `POST /api/v1/jukebox/admin/devices/:id/logout-all`, `POST /api/v1/jukebox/admin/skip`, `POST /api/v1/jukebox/admin/sync-metadata`, `GET /api/v1/jukebox/admin/songs`, `PATCH /api/v1/jukebox/admin/songs/:id/classification`, `POST /api/v1/jukebox/admin/scan-folder`, `POST /api/v1/jukebox/admin/upload-song`, `DELETE /api/v1/jukebox/admin/songs/:id`, `GET /api/v1/jukebox/admin/devices`, `POST /api/v1/jukebox/admin/devices`, `PUT /api/v1/jukebox/admin/devices/:id`, `GET /api/v1/jukebox/admin/spotify-devices`, `PUT /api/v1/jukebox/admin/devices/:id/spotify-playback-target`, `GET /api/v1/jukebox/admin/playlist-preview`, `POST /api/v1/jukebox/admin/process-song` | Web controller; classification, Spotify alias ve bazı yönetim route'ları için taranan UI'da çağrı bulunmadı. Admin route grubu merkezi admin guard + rate limit arkasında |
| `jukebox` — moderasyon | `GET /api/v1/jukebox/admin/moderation/settings`, `PUT /api/v1/jukebox/admin/moderation/settings`, `GET /api/v1/jukebox/admin/moderation/keywords`, `POST /api/v1/jukebox/admin/moderation/keywords`, `DELETE /api/v1/jukebox/admin/moderation/keywords/:id`, `POST /api/v1/jukebox/admin/moderation/test` | Web controller |
| `jukebox` — blocklist | `POST /api/v1/jukebox/admin/songs/:id/block`, `DELETE /api/v1/jukebox/admin/songs/:id/block`, `POST /api/v1/jukebox/admin/artists/block`, `DELETE /api/v1/jukebox/admin/artists/:id/block`, `GET /api/v1/jukebox/admin/blocked` | Taranan istemcilerde çağrı bulunmadı; merkezi admin guard arkasında |
| `jukebox` — kiosk | `POST /api/v1/jukebox/kiosk/register`, `POST /api/v1/jukebox/kiosk/spotify-token`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/status`, `POST /api/v1/jukebox/kiosk/spotify-device-auth/start`, `POST /api/v1/jukebox/kiosk/spotify-device`, `GET /api/v1/jukebox/kiosk/playback-state/:deviceId`, `POST /api/v1/jukebox/kiosk/now-playing` | Kiosk web |
| `spotify` | `GET /api/v1/spotify/auth`, `GET /api/v1/spotify/callback`, `GET /api/v1/spotify/status`, `POST /api/v1/spotify/device-auth/start`, `GET /api/v1/spotify/device-auth/callback`, `GET /api/v1/spotify/device-auth/status`, `DELETE /api/v1/spotify/device-auth/:deviceId`, `GET /api/v1/spotify/app-config`, `PUT /api/v1/spotify/app-config`, `GET /api/v1/spotify/playback-devices` | Web controller çağrıları: device-auth start/status, app-config, playback-devices. OAuth callback'leri Spotify yönlendirmesidir. Diğerlerinde doğrudan UI çağrısı bulunmadı |
| `radio-profiles` — opsiyonel mount | `GET /api/v1/radio-profiles`, `POST /api/v1/radio-profiles`, `GET /api/v1/radio-profiles/:id`, `PUT /api/v1/radio-profiles/:id`, `DELETE /api/v1/radio-profiles/:id`, `POST /api/v1/radio-profiles/:id/assets`, `DELETE /api/v1/radio-profiles/:id/assets/:songId/:slotType`, `PUT /api/v1/radio-profiles/devices/:deviceId/profile`, `PUT /api/v1/radio-profiles/devices/:deviceId/override` | İstemci çağrısı bulunmadı; mount flag'i açık olduğunda router admin guard uygular |

## Route olmayan HTTP/static yüzeyler

- `GET /health`, `GET /health/live` ve token korumalı `GET /health/ready`; PUBLIC_BASE_PATH tanımlıysa bu uçlar aynı prefix altında da mount edilir.
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

## Arka plan işi endpoint'leri (G5)

- `GET /api/v1/jobs/:jobId`: kimlik doğrulamalı; yalnız işi başlatan kullanıcı veya admin job state/progress/result görebilir.
- `POST /api/v1/jukebox/admin/scan-folder`, `POST /api/v1/jukebox/admin/process-song`, `POST /api/v1/jukebox/admin/sync-metadata` ve `POST /api/v1/podcast-feeds/sync` kuyruk işi kabul edildiğinde `202` ve `data.job_id` döndürür; sonucu `GET /api/v1/jobs/:jobId` üzerinden izlenir.
- `POST /api/v1/podcast-feeds` feed'i oluşturur ve ilk RSS senkronizasyonunu kuyruğa alır; response içindeki `sync_job_id` varsa iş numarasıdır.
- Bu kuyruk uçları BullMQ/Redis kullanır. `REDIS_URL` ayarlanmamış/erişilemiyorsa kuyruk kabul eden uçlar `503 JOBS_UNAVAILABLE` döndürür.

## Strict payload groups (G3 follow-up, 2026-09-24)

- Auth bodies: register `{ email, password, display_name }`; login `{ email, password }`; guest `{ display_name }`; refresh `{ refresh_token }`. All reject unknown fields and use bounded values.
- `PUT /api/v1/profile/me` and `PUT /api/v1/profile/favorites` accept only declared optional/null profile strings with per-field length limits; unknown properties and wrong value types return 400.
- Feature-flagged `/api/v1/radio-profiles/*` write payloads now reject unknown fields; profile/device IDs are UUIDs and asset slot is `jingle | ad`.
- `PUT /api/v1/spotify/app-config` accepts only `client_id` and optional `client_secret` within bounds. The secret remains masked in reads.
- These schemas add no endpoint or UI route. Validation coverage is incremental; other write endpoints remain to be audited.

## Strict payload groups: jukebox admin and moderation (2026-09-24)

- `POST /api/v1/jukebox/admin/skip`: strict `{ device_id }`, UUID required.
- `PATCH /api/v1/jukebox/admin/songs/:id/classification`: strict optional `visibility: public | hidden` and `asset_role: music | jingle | ad`; song path ID must be UUID and at least one field is required.
- Admin device create/update and Spotify playback-target writes reject unknown fields, bound strings, require booleans for flags, and validate device IDs as UUIDs.
- Artist block, moderation settings, keyword creation and moderation test bodies are strict and bounded. Moderation test accepts text or a title/artist pair; minimum popularity must be 0–100.
- These are validation changes to already inventoried routes. No new UI/API routes were added in this phase.

## Realtime and remaining jukebox validation (2026-09-24)

- Socket.IO is separate from REST: authenticated user/kiosk handshakes, guarded `join_device`/`leave_device`, `playback_progress`, and `kiosk_heartbeat`; strict payload schemas, per-event limits, room membership and session ownership checks apply. JWT or kiosk credential expiry disconnects the socket.
- The REST jukebox route inventory remains as listed above. Connect/disconnect, kiosk register, kiosk now-playing, autoplay trigger, and block operations have strict payload/path validation. These changes introduce no new routes.

## Final non-game source scan — 2026-09-24

This section is the current source-of-truth correction for the main table above; it was checked against every route declaration under `backend/src/routes`, mounts in `backend/src/server.ts`, and non-game client API calls in `mobile/src`, `jukebox-web-controller/src`, and `kiosk-web`.

- Generic admin device update is `PATCH /api/v1/jukebox/admin/devices/:id` (partial update). The four AdminDashboard calls use PATCH. The old PUT route is removed.
- Duplicate `GET /api/v1/jukebox/admin/spotify-devices` is removed. Use the canonical admin `GET /api/v1/spotify/playback-devices` route.
- Current non-game admin jukebox route set includes provisioning/logout-all, skip, metadata sync, song list/classification/scan/upload/delete/process, device list/create/patch, Spotify target, playlist preview, moderation settings/keywords/test, and song/artist blocklist operations. Existing exact paths and guards are represented in the main table; the removed duplicate above must not be counted.
- Current kiosk route set also includes `POST /api/v1/jukebox/kiosk/spotify-device-auth/status`, `POST /start`, and `POST /api/v1/jukebox/kiosk/spotify-device`, in addition to register, token, playback state and now-playing.
- Podcast feed deletion validates a UUID; the route remains `DELETE /api/v1/podcast-feeds/:id`. Radio history remains `GET /api/v1/radio/history/:channelId` with a bounded opaque channel identifier.
- Request validation now covers strict/bounded jukebox queue/vote, connect/disconnect, kiosk registration and Spotify bodies, admin mutations, moderation writes, catalog/lyrics queries, feed create/sync/delete, profile/auth writes, optional radio-profile writes, Spotify app-config writes, and job status IDs. Socket.IO remains outside REST and is listed separately below.
- `GET /api/v1/jukebox/queue/:deviceId` returns queue data only to an admin, a user with a `device_sessions` row for that device, or the matching kiosk presenting `x-kiosk-credential`. Kiosk credentials must be active, unexpired and unrevoked.
- `backend-refactor/` is an isolated scaffold and its `/api/v1/identity/*` paths are not mounted by the main backend; they are not production endpoints in this inventory.
- The existing gamification inventory row was left unchanged under the no-game scope.

### Socket.IO source surface

`/socket.io` (or configured `{PUBLIC_BASE_PATH}/socket.io`) is not a REST endpoint. Authenticated user/kiosk handshakes emit `join_device`/`leave_device`; kiosk events are `playback_progress` and `kiosk_heartbeat`. Room access checks device session/admin/kiosk ownership, payloads are strict and bounded, per-event limits apply, and token/credential expiry disconnects the socket.

## Final inventory pass — 2026-09-24

Source recheck after the queue authorization decision confirms the route and client entries above are current: `GET /api/v1/jukebox/queue/:deviceId` requires an admin role, a matching connected-user device session, or the active matching kiosk credential in `x-kiosk-credential`. The kiosk sends its stored credential, and CORS permits the header. No endpoint paths were added or removed in this final pass.

## Final non-game inventory refresh (2026-09-24)

- Profile writes are `PATCH /api/v1/profile/me` and `PATCH /api/v1/profile/favorites`. The mobile profile service uses PATCH; only explicitly supplied fields change. Unknown fields and empty bodies are rejected.
- Jukebox playback state `GET /api/v1/jukebox/kiosk/playback-state/:deviceId` requires admin access, a matching user device session, or a valid active kiosk credential in `x-kiosk-credential`. The controller supplies its access cookie; kiosk supplies its kiosk credential. CORS allows the kiosk header.
- Public liveness routes are `GET /health` and `GET /health/live`. `GET /health/ready` is hidden unless a valid `HEALTHCHECK_TOKEN` bearer token is configured and supplied; it returns only a generic status and checks DB, upload storage writability, and configured Redis readiness.
- Spotify OAuth and device authorization state is single-use and expires after 10 minutes; both flows use PKCE S256. Callback/start/status/device routes have strict bounded input validation. Auth access JWT verification accepts HS256 only.
- Removed unused `POST /api/v1/spotify/refresh`; Spotify token refresh is an internal backend service operation. No mobile, controller, or kiosk client called this route.
- Additional non-game event/reward administration route: `POST /api/v1/gamification/admin/qr-rewards/:rewardId/token` issues an event QR reward token and is admin-guarded. It is listed separately so the existing game route entries remain untouched.
- `PUBLIC_BASE_PATH` is applied to static/controller, Socket.IO, and health paths; API routes remain at the canonical `/api/v1` prefix.
- This refresh covers existing routes plus the new liveness/readiness paths. `backend-refactor` remains unmounted and contributes no live API routes. The gamification row above was not changed under the no-game scope.

## Final pre-live auth and readiness scan (2026-09-25)

- Added `POST /api/v1/auth/logout`; the controller calls it to revoke its refresh session and clear HttpOnly cookies. Browser register/login/guest/refresh use `x-auth-transport: cookie`; cookie clients receive tokens only through HttpOnly SameSite=Strict cookies. Mobile continues to use bearer access tokens and body-based refresh.
- Controller session restore calls `GET /api/v1/auth/me` with credentials; expired access cookies trigger one `POST /api/v1/auth/refresh` retry. Socket.IO uses the access cookie. The controller no longer stores bearer tokens in localStorage.
- New JWTs require HS256, the configured issuer/audience, and a dedicated refresh audience. A temporary `JWT_ALLOW_LEGACY_TOKENS` switch controls old issuerless sessions.
- `/health`, `/health/live`, and `/health/ready` are also mounted at `{PUBLIC_BASE_PATH}/health*` when configured. Readiness checks DB, writable uploads, configured rate-limit Redis, and BullMQ worker readiness; a bearer `HEALTHCHECK_TOKEN` is required.
- BullMQ requires Redis 5 or newer. Startup rejects older Redis versions and keeps non-test readiness unavailable until the worker is ready.
- For `PUBLIC_BASE_PATH=/jukebox`, the access cookie uses `/jukebox` so browsers send it to both `/jukebox/api/v1/*` and `/jukebox/socket.io`; the refresh cookie uses `/jukebox/api/v1/auth`. Without a base path, access uses `/` and refresh uses `/api/v1/auth`.
- Public deployment preflight (2026-09-25): `OPTIONS /jukebox/api/v1/auth/login` returned 204 but omitted `Access-Control-Allow-Credentials`, `PATCH`, `x-auth-transport`, and `x-kiosk-credential` from CORS response headers. The deployed response does not match the current source configuration; credentialed controller auth and kiosk credential headers are blocked until deployment/proxy configuration is updated.
- The new browser logout route and cookie flow are current in the route table. The game route entries remain unchanged.

## User directory availability scan (2026-09-25)

- `backend/src/routes/users.ts` currently exposes only `GET /api/v1/users/leaderboard`; there is no admin-only user listing endpoint.
- The existing user result route is a ranking response, not a complete account directory. No user-list endpoint was added in this scan.

### Public Jukebox availability probe (2026-09-25)

- Outside accessibility is confirmed for `/jukebox/`, `/jukebox/kiosk/`, and the songs catalog API (all HTTP 200). This verifies routing and basic catalog response only, not login, voting, playback or socket behavior.
- Public `/jukebox/health` is 200 while `/jukebox/health/live` is 404. CORS preflight is 204 but omits credentials, PATCH, `x-auth-transport` and `x-kiosk-credential`.
- See `jukebox-live-toggle-runbook.md` for the service state, safe shutdown/restore sequence, and checks. No live switch was changed.

### Post-restart runtime verification (2026-09-25)

- After `RadioTEDU-Jukebox` automatically recovered from a WinSW stop-handler error, local IIS returned 200 for `/jukebox/health/live` and for token-authenticated `/jukebox/health/ready`. An unauthenticated readiness request returns 404 by design.
- The login CORS preflight now returns 204 with credentials, PATCH, `x-auth-transport`, and `x-kiosk-credential`; controller root and kiosk root both return 200.
- These are local IIS runtime checks. Real browser cookie login, authenticated Socket.IO, and testing from the configured public hostname remain unverified. The source API route inventory above is unchanged.
- Initial interactive smoke: guest auth returned 201 and device connect returned 200; after refresh the user remained signed in, confirming cookie session restore. The UI did not restore the selected device code, so it must be entered again. Authenticated Socket.IO remains unverified.
- Socket.IO polling through local IIS first returned 404 because the proxy target omitted the configured `/jukebox` base path. The machine IIS rule now forwards to the backend's `/jukebox/socket.io`; polling and an authenticated namespace connection/device-room join both pass.
- An authenticated Socket.IO smoke through IIS connected with an existing guest/device session and successfully emitted `join_device`; backend logs recorded both socket connection and device-room join. This validates the token/cookie handshake and authorization path at runtime. The real browser's visible connection state remains a UI confirmation.
- Applied `backend/src/db/migrations/20260925_kiosk_credentials.sql` to the active `radiotedu` database after validating a full custom-format backup. `kiosk_provisioning_codes` and `kiosk_credentials` now exist, so the documented admin provisioning and kiosk registration routes have their required schema. No kiosk credential has been issued yet; the active `KOLEJ` device still needs admin provisioning and Spotify device authorization.

## Backend-refactor son taraması (2026-09-26, izole uygulama)

Aşağıdaki yüzey `backend-refactor/src/routes/index.ts`, `composition-root.ts` ve modül router'ları taranarak çıkarıldı. Bu backend `backend/src/server.ts` tarafından mount edilmediğinden, tablo mevcut canlı endpoint listesine eklenmiş gibi değerlendirilmemelidir. Route adları refactor kodundaki kanonik `/api/v1` prefix'iyle gösterilir. Refactor admin yolları merkezi `ADMIN` guard, rate limit ve audit middleware'inden geçer; eski istemci uyumluluk yolları da aynı admin guard ile mount edilir.

| Modül / mount | Refactor sürümündeki metot ve tam yollar | İstemci / durum |
|---|---|---|
| Kimlik | `POST /api/v1/auth/register`, `/login`, `/guest`, `/refresh`, `/logout`; `GET /api/v1/auth/me`; avatar uyumluluk alias'ı `POST /api/v1/auth/upload-avatar` | Mobil ve web controller'daki auth akışlarıyla şekil uyumu hedeflenir; refactor henüz canlıya alınmadı |
| Kullanıcı ve profil | `GET /api/v1/users/leaderboard`, `/users/me`, `/users/me/profile`; `PATCH /api/v1/users/me/profile`, `/users/me/favorites`; `POST /api/v1/users/me/avatar` | Mobil ve controller; eski profil alias'ları da guarded `/api/v1/profile/me` ve `/api/v1/profile/favorites` |
| Cihazlar | `GET /api/v1/jukebox/devices`; `POST /api/v1/jukebox/kiosk/register`; admin `GET/POST /api/v1/admin/jukebox/devices`, `PATCH /api/v1/admin/jukebox/devices/:id`, `POST /api/v1/admin/jukebox/devices/:id/logout-all`, `/provision`, `PUT /api/v1/admin/jukebox/devices/:id/spotify-playback-target` | Controller admin paneli ve kiosk; admin uyumluluk alias'ı `/api/v1/jukebox/admin/*` |
| Jukebox kullanıcı/kiosk | `POST /api/v1/jukebox/connect`, `/disconnect`, `/queue`, `/vote`, `/kiosk/heartbeat`, `/kiosk/now-playing`, `/autoplay/trigger`; `GET /api/v1/jukebox/queue/:deviceId`, `/jukebox/songs`, `/jukebox/lyrics`, `/jukebox/kiosk/playback-state/:deviceId`; Spotify kiosk: `POST /api/v1/jukebox/kiosk/spotify-token`, `/spotify-device-auth/status`, `/spotify-device-auth/start`, `/spotify-device` | Mobil, web controller ve kiosk web; autoplay endpoint'i bu uygulama turunda eklendi ve Spotify playlist'i yoksa veya uygun parça dönmezse güvenli managed local fallback kullanır. Kuyruk ve playback state cihaz oturumu veya eşleşen kiosk credential ister; POST kiosk yazma işlemleri tercihen `x-kiosk-credential` header kullanır ve mevcut kiosk istemcisinin uyumluluğu için `device_pwd` gövde alanını da kabul eder (query string kabul edilmez) |
| Jukebox admin/katalog | `POST /api/v1/admin/jukebox/skip`, `/upload-song`, `/scan-folder`, `/process-song`, `/sync-metadata`; `GET /api/v1/admin/jukebox/songs`, `/playlist-preview`; `PATCH /api/v1/admin/jukebox/songs/:id/classification`; `DELETE /api/v1/admin/jukebox/songs/:id`; moderasyon `GET/PUT /moderation/settings`, `GET/POST /moderation/keywords`, `DELETE /moderation/keywords/:id`, `POST /moderation/test`; blocklist `GET /blocked`, `POST /songs/:id/block`, `DELETE /songs/:id/block`, `POST /artists/block`, `DELETE /artists/:id/block` (hepsi `/api/v1/admin/jukebox` altında) | AdminDashboard; uyumluluk alias'ları `/api/v1/jukebox/admin/*`; uzun işler `202` + `job_id` döndürür |
| Spotify | Public callback: `GET /api/v1/spotify/callback`, `/spotify/device-auth/callback`. Admin: `GET /api/v1/admin/spotify/auth`, `/status`, `/app-config`, `/device-auth/status`, `/playback-devices`; `PUT /api/v1/admin/spotify/app-config`; `POST /api/v1/admin/spotify/device-auth/start`; `DELETE /api/v1/admin/spotify/device-auth/:deviceId`. Admin eski alias'ı aynı yolların `/api/v1/spotify/*` altındaki korumalı biçimidir. | Controller admin paneli ve kiosk web; gerçek Spotify grant/playback testi dış hesap ve cihaz gerektirir, yapılmadı |
| Radyo / profiller | `GET /api/v1/radio/status`, `/schedule`, `/history/:channelId`; admin `/api/v1/admin/radio-profiles`: `GET/POST /`, `GET/PUT/DELETE /:id`, `POST /:id/assets`, `DELETE /:id/assets/:songId/:slotType`, `PUT /devices/:deviceId/profile`, `/devices/:deviceId/override` | Radyo istemcileri ve admin paneli; eski guarded alias `/api/v1/radio-profiles/*` |
| Podcast | `GET /api/v1/podcasts`; guarded feed yönetimi `GET/POST /api/v1/admin/podcast-feeds`, `POST /api/v1/admin/podcast-feeds/sync`, `DELETE /api/v1/admin/podcast-feeds/:id`; eski guarded alias `/api/v1/podcast-feeds/*` | Mobil feed servisi; RSS fetch işleri BullMQ kuyruğunda |
| Job durumu | `GET /api/v1/jobs/:jobId` | Başlatan kullanıcı veya admin; job sahipliği denetlenir |

`backend-refactor` tarafında `/api/v1/users/:id/stats`, gamification veya oyun endpoint'i yoktur. Kullanıcı stats endpoint'i istemci kaynak taramasında çağrılmadığı ve IDOR riski taşıdığı için kaldırılmıştır. Oyun/gamification, kullanıcı talimatıyla kapsam dışıdır.

### İstemci bağlantısı çapraz kontrolü

- Kiosk `app.js` autoplay, queue, now-playing, Spotify token/device ve playback-state yollarını; `device-spotify-auth.js` kiosk Spotify OAuth başlatma/durum yollarını çağırıyor. `GET /jukebox/lyrics` kiosk ve controller tarafından çağrılıyor.
- Web controller `App.tsx` jukebox queue, vote, catalog, connect, profile/session ve lyrics akışlarını çağırıyor; `AdminDashboard.tsx` admin cihaz, provisioning, Spotify ayarları, moderasyon, katalog, upload ve job durumlarını çağırıyor.
- Mobil `JukeboxScreen.tsx` cihaz, katalog, bağlanma, queue ve vote akışlarını; profil/auth servisleri kendi tablolarında yazılı yolları çağırıyor.
- Bu kaynak çağrıları şu an canlı backend ile ilgilidir. Refactor'a cutover yapılmadığı için aynı isimli route'u tanımlamak refactor'un canlı kullandığı anlamına gelmez.

### Socket.IO — refactor kodu

Handshake JWT veya cihaz kapsamlı kiosk credential ister. Sunucudan gelen olaylar `queue_updated`, `song_skipped`, `song_rejected`, `force_logout`; istemci→sunucu olayı `join_device`'tır. Oda üyeliği cihaz oturumu/rol/kiosk sahipliğiyle doğrulanır, event başına sınır uygulanır; JWT süresi veya kiosk credential iptal/sona erme halinde bağlantı kapatılır. Bu refactor Socket.IO yüzeyi mevcut backend sürümünden ayrı tutulur.
## Backend-refactor completion re-scan (2026-09-26)

- Rechecked mounted route declarations after the non-game backend implementation pass. The refactor remains isolated under `backend-refactor/`; none of these paths are live until a separately planned cutover.
- Added `PATCH /api/v1/admin/jukebox/devices/:id/playback-target` with `{ provider: "spotify", target_id, player_name? }`. The prior `PUT /api/v1/admin/jukebox/devices/:id/spotify-playback-target` remains available for current clients. Spotify is the only implemented playback provider.
- `GET /api/v1/users/me?include=profile` returns profile and badges when requested; existing `/users/me/profile` and guarded `/profile/*` compatibility routes remain.
- Podcast feed administration operates on the complete feed registry, matching the active admin-router contract. List, delete and sync are admin-only and not restricted to the creator.
- Audio processing invokes `ffprobe` without a shell, validates the audio stream/container and duration, and rejects files over four hours; uploads are limited to 50 MB. Docker runtime installs ffmpeg. Local deployments need `ffprobe` on `PATH` or `FFPROBE_PATH` configured.
- The refactor OpenAPI document is generated from request Zod schemas with `cd backend-refactor && npm run openapi:generate` into `backend-refactor/docs/openapi.json`. It is not a live endpoint or a replacement for the active backend inventory.
- Existing web/mobile/kiosk components continue to use the compatible Spotify playback-target route; this pass adds no client UI route. No game or gamification source or inventory row was changed.
- Build, lint and the 17 refactor tests passed after the additions. No database was connected or migrated and no live service was restarted.
- Upload validation runs ffprobe before storing a newly uploaded audio file; malformed media does not create an upload or song row.

## Backend-refactor final non-game re-scan (2026-09-26)

- Completed the mounted endpoint and realtime contract scan for the isolated `backend-refactor/` implementation. Generated contract artifact: `backend-refactor/docs/openapi.json` (`npm run openapi:generate`). Production endpoints still come from `backend/`; this refactor is not mounted in production.
- Jukebox write endpoints reject unexpected query input. Queue reads require a connected user/device session or a valid active kiosk credential, including Socket.IO room joins; ADMIN role by itself is insufficient.
- Kiosk heartbeat is credential protected and updates device liveness. It also reconciles stopped Spotify playback with the configured Connect target, starts the next queued Spotify item or triggers autoplay, and emits `queue_updated`. Spotify failures are contained so the kiosk heartbeat remains available. Credentialed `/jukebox/kiosk/now-playing` completion also runs the same profile automation for completed normal music.
- Radio profile completion automation enqueues configured local jingle/ad assets with queue priority and updates ad-break timing transactionally. The admin profile/asset/override routes remain behind the central ADMIN guard.
- Socket.IO compatibility: `join_device` supports the active kiosk client's raw UUID payload and the object payload; `leave_device`, `playback_progress`, and `kiosk_heartbeat` are validated and rate limited. The Socket.IO path respects `PUBLIC_BASE_PATH`.
- Playback target compatibility remains: provider-shaped `PATCH /api/v1/admin/jukebox/devices/:id/playback-target` plus Spotify-specific `PUT /api/v1/admin/jukebox/devices/:id/spotify-playback-target`.
- Final verification for this pass: build, lint, Prisma validation, OpenAPI generation, and 25 automated tests passed. No database migration or service restart occurred. Legacy schema baseline, staging, and live Spotify checks are rollout gates, not implementation claims.
- Game/gamification endpoints were not added or changed.

### Architecture acceptance addendum (2026-09-26)

- Shared clock/ID ports are now wired into identity, jukebox, Spotify OAuth, avatar and catalog job-ID use cases. External Spotify OAuth/playback HTTP is behind `SpotifyOAuthHttpProvider`; module services no longer issue direct HTTP fetches.
- Negative lint probe confirmed Prisma imports in `identity.service.ts` are rejected; the probe was restored. Static scan found service/controller layer boundaries intact, `process.env` only in core configuration, and no raw Prisma SQL or shell-execution APIs in refactor source.
- Final build/lint/test checks passed (25 tests). The refactor deployment remains independently gated on legacy database baseline review, staging checks and real Spotify playback.
