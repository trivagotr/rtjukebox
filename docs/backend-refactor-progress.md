# Backend refactor ilerlemesi

Bu kayıt, `Desktop/JukeBox Refactor` altındaki `backend-asset.md` adımlarının uygulanma durumunu ve her adımda değişen dosyaları tutar. Adımlar onay geldikçe sırayla ilerletilir. Endpoint ve UI component envanterleri, tüm refactor adımları tamamlandıktan sonra son adım olarak yeniden taranacaktır.

## Adım 1 — Kök iskelet ve araç zinciri

**Durum:** Tamamlandı.

**Eklenen dosyalar:**

- `backend-refactor/package.json`
- `backend-refactor/tsconfig.json`
- `backend-refactor/eslint.config.mjs`
- `backend-refactor/.prettierrc.json`
- `backend-refactor/.env.example`
- `backend-refactor/.gitignore`
- `backend-refactor/.dockerignore`
- `backend-refactor/Dockerfile`
- `backend-refactor/docker-compose.yml`
- `backend-refactor/README.md`

**Kontrol:** JSON dosyaları ayrıştırıldı; `eslint.config.mjs` için `node --check` başarılı oldu. Paket kurulumu, build ve test bu adımda çalıştırılmadı; henüz kaynak kodu yok.

## Adım 2 — Ortak çekirdek (`src/core`)

**Durum:** Uygulandı; statik yapılandırma gözden geçirildi. Paket bağımlılıkları kurulmadığı için TypeScript derlemesi çalıştırılmadı.

**Eklenen dosyalar:**

- `backend-refactor/src/core/errors/app-error.ts`
- `backend-refactor/src/core/http/request.d.ts`
- `backend-refactor/src/core/http/request-id.middleware.ts`
- `backend-refactor/src/core/http/async-handler.ts`
- `backend-refactor/src/core/http/error-handler.ts`
- `backend-refactor/src/core/types/dto.ts`
- `backend-refactor/src/core/validation/validation.middleware.ts`
- `backend-refactor/src/core/auth/auth.types.ts`
- `backend-refactor/src/core/auth/auth.middleware.ts`
- `backend-refactor/src/core/logging/logger.ts`
- `backend-refactor/src/core/config/env.ts`
- `backend-refactor/src/core/ports/storage.port.ts`
- `backend-refactor/src/core/ports/job-queue.port.ts`
- `backend-refactor/src/core/ports/clock.port.ts`
- `backend-refactor/src/core/ports/id-generator.port.ts`

**Kontrol:** `process.env` yalnız `src/core/config/env.ts` içinde okunuyor. Service ve controller dosyaları henüz yok; katman kuralı ihlali oluşturacak import bulunmuyor. Guard'lar sonraki auth/composition adımlarında bağlanmak üzere fail-closed `NotImplementedError` iskeletidir.

## Adım 3 — Modül şablonu ve `identity`

**Durum:** Tamamlandı; statik katman/import kontrolleri yapıldı. Paket bağımlılıkları kurulmadığı için TypeScript derlemesi çalıştırılmadı.

**Eklenen dosyalar:**

- `backend-refactor/src/modules/_template/template.router.ts`
- `backend-refactor/src/modules/_template/template.controller.ts`
- `backend-refactor/src/modules/_template/template.service.ts`
- `backend-refactor/src/modules/_template/template.schema.ts`
- `backend-refactor/src/modules/_template/template.dto.ts`
- `backend-refactor/src/modules/_template/ports/template.repository.ts`
- `backend-refactor/src/modules/_template/infra/prisma-template.repository.ts`
- `backend-refactor/src/modules/_template/template.module.ts`
- `backend-refactor/src/modules/identity/identity.router.ts`
- `backend-refactor/src/modules/identity/identity.controller.ts`
- `backend-refactor/src/modules/identity/identity.service.ts`
- `backend-refactor/src/modules/identity/identity.schema.ts`
- `backend-refactor/src/modules/identity/identity.dto.ts`
- `backend-refactor/src/modules/identity/ports/user.repository.ts`
- `backend-refactor/src/modules/identity/infra/prisma-user.repository.ts`
- `backend-refactor/src/modules/identity/identity.module.ts`

**Kontrol:** `identity.service.ts` içinde Prisma veya Express import'u yok; yalnızca UserReader/UserWriter port tiplerini kullanıyor. `UserRepository`, okuma ve yazma arayüzlerini birleştiriyor; Prisma adapter henüz `NotImplementedError` iskeleti. Register/login handler'ları da iş mantığı uygulamadan aynı hata ile kapanıyor. `passwordHash`, Identity DTO mapper'ına dahil değil. Modül isimleri dosya görevleriyle çakışmıyor; `_template` yalnızca kopyalanacak şablondur. `process.env` hâlâ yalnız `core/config/env.ts` içinde okunuyor.

## Adım 4 — Composition root ve bootstrap

**Durum:** Tamamlandı.

**Eklenen/değiştirilen başlıca dosyalar:**

- `backend-refactor/src/composition-root.ts`
- `backend-refactor/src/app.ts`
- `backend-refactor/src/server.ts`
- `backend-refactor/src/routes/index.ts`
- `backend-refactor/src/modules/admin/admin.router.ts`
- `backend-refactor/prisma/schema.prisma`
- `backend-refactor/prisma.config.ts`
- `backend-refactor/prisma/migrations/migration_lock.toml`
- `backend-refactor/prisma/migrations/20260924000000_init/migration.sql` (Prisma CLI ile boş şemadan üretildi)
- Prisma adapter tiplerinin `backend-refactor/generated/prisma` çıktısını kullanması için identity/template modül dosyaları güncellendi.
- Prisma 7 client generate/build/typecheck komutları, `express-rate-limit`, lockfile ve üretim/build Docker aşamaları için `backend-refactor/package.json`, `package-lock.json`, `Dockerfile`, `.gitignore`, `tsconfig.json` güncellendi.
- `backend-refactor/src/core/config/env.ts`, `src/core/logging/logger.ts`, `eslint.config.mjs`, `.env.example`, `docker-compose.yml` ve `README.md` güncellendi.

**Kontrol:** Prisma Client üretimi, `npm run typecheck`, `npm run lint` ve `npm run build` başarılı. ESLint sınır kuralları uyarısız çalışıyor. Prisma migration boş şemadan CLI ile üretildi; DB'ye uygulanmadı. `process.env` yalnızca `core/config/env.ts` içinde okunuyor. `npm install` dört yüksek önem seviyeli audit bulgusu raporladı; bu adımda otomatik düzeltme uygulanmadı.

## Adım 5 — Son kontrol

**Durum:** Tamamlandı.

**Kontroller:**

- `npm run lint` başarılı; kullanılmayan import/değişken ve ESLint'in yakaladığı ölü kod kontrolleri temiz.
- ESLint sınır kuralı için `identity.service.ts` içine geçici Prisma import'u eklenince lint beklenen şekilde başarısız oldu. Deneme kodu geri alındı ve lint yeniden başarılı oldu.
- `npm run typecheck` Prisma Client üretimiyle başarılı. İlk deneme `DATABASE_URL` tanımlı olmadığı için Prisma config aşamasında durdu; geçici yerel URL ile tekrar çalıştırınca tamamlandı.
- Kaynak ve Prisma dosyalarında `db push`, `$queryRaw`, `$executeRaw` veya `child_process.exec` kullanımı bulunmadı. `process.env` yalnızca `src/core/config/env.ts` içinde okunuyor.
- `src/` altındaki dosya taban adlarında çakışma bulunmadı. README klasör yapısı ve katman kuralları mevcut iskeletle uyumlu.

Bu aşamada endpoint ve UI component envanterleri güncellenmedi; istek doğrultusunda tüm MD çalışmalarının son adımı olarak yapılacak. `backend-asset.md` içindeki uygulama adımları tamamlandı. Kullanıcı onayıyla `how-to-backend.md` çalışması sürüyor.

## `how-to-backend.md` — Faz 0 güvenlik düzeltmeleri

**Kapsam notu:** Bu rehber mevcut `backend/src` üzerinde acil güvenlik düzeltmelerini açıkça istediği için, onayla mevcut backend'e de hedefli değişiklikler uygulandı. Yeni mimari iskelet `backend-refactor/` içinde ayrı duruyor.

### G1 — Jukebox alias'ı

**Durum:** Uygulandı.

- `backend/src/server.ts`: genel `/jukebox` router mount'u kaldırıldı. Eski `/jukebox/kiosk/*` API yolları 308 ile `/api/v1/jukebox/kiosk/*` adresine yönlendiriliyor. API router'ları artık `PUBLIC_BASE_PATH` ile ikinci kez mount edilmiyor; `PUBLIC_BASE_PATH` statik kiosk/controller dosyaları ve socket path'i için tutuldu.
- `kiosk-web/config.js` ve `jukebox-web-controller/src/runtimeConfig.ts`: API istekleri kök origin'e yönlendirildi; `jukebox-web-controller/src/runtimeConfig.test.ts` beklentisi buna göre güncellendi.

**Kontrol:** Backend `npm run build` başarılı. Runtime config testi 2/2 geçti. Lint hata vermedi; mevcut ağaçta 50 uyarı kaldı. Alias'lar sunucu entegrasyon ortamında canlı HTTP ile ayrıca denenmedi.

### G2 — Admin guard'ı

**Durum:** Uygulandı.

- `backend/src/routes/jukebox.ts`: `/admin/*` istekleri için auth ve `ADMIN` rol kontrolü tek router middleware noktasına alındı. 26 admin route'undaki tekrarlı auth middleware kaldırıldı; normal kullanıcı token'ı 403 alıyor.
- `backend/src/routes/spotifyPlaybackDevices.test.ts`: router seviyesindeki rol guard'ını doğrulayacak mock eklendi.

**Kontrol:** `spotifyPlaybackDevices.test.ts` 9/9 geçti. Backend build başarılı. Lint hata vermedi; 50 uyarı var. Radio profiles router'ında mevcut router seviyesindeki admin kontrolü zaten bulunuyordu.

Endpoint ve UI envanterleri hâlâ beklemede; rehberdeki bütün güvenlik işleri tamamlandıktan sonra son aşamada taranacak.

### Faz 0 — Diğer acil düzeltmeler

**Kısmi durum:** Uygulanabilen maddeler tamamlandı; kiosk provisioning akışının kalıcı tek kullanımlık kod/cihaz token'ı kısmı açık.

- `backend/src/routes/jukebox.ts`: kiosk device password karşılaştırması timing-safe yapıldı; parolasız kayıt/erişim kapatıldı; kayıt yanıtı artık cihaz parolasını döndürmüyor. Spotify token yalnız POST ile, gövdedeki cihaz kimliği ve credential üzerinden veriliyor; GET kaldırıldı. `jukebox-web-controller` ve kiosk istemcileri kök API origin'ine geçirildi.
- `backend/src/middleware/upload.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/jukebox.ts`: avatar limiti 2 MB, şarkı limiti 50 MB; avatar yalnız JPEG/PNG/GIF/WebP, ses yalnız MP3/M4A/WAV imza ve uzantı eşleşmesiyle kabul ediliyor. Hatalı yükleme dosyası temizleniyor. `/uploads` yanıtlarında `nosniff` ve sandbox CSP var.
- Ses yüklemesi ayrıca `ffprobe` ile gerçek audio stream/container doğrulamasından geçiyor; okunamayan dosyalar ve 4 saati aşan parçalar reddedilip siliniyor.
- `backend/src/routes/jukebox.ts`: `scan-folder` yalnız gerçek dosyaları işler; işlem rotası DB'deki dosya adını sabit `/uploads/songs` köküne sınırlar, symlink/gerçek yol kontrolü yapar ve oluşan çıktıyı aynı kök içinde doğrular. FFmpeg çağrısı `fluent-ffmpeg` üzerinden; `child_process.exec` kullanılmıyor.
- `backend/src/services/podcastFeeds.ts`: feed URL'i yalnız HTTP(S), kimlik bilgisi ve varsayılan dışı port reddi; her DNS sonucu public unicast olmalı, her redirect (en çok 3) yeniden doğrulanıyor ve resolved IP'ye pinleniyor. 10 sn timeout, 5 MB üst sınırı, XML content-type allowlist ve `processEntities: false` eklendi. `ipaddr.js` direct dependency oldu.
- `backend/src/db.ts`, `backend/src/services/gamification.ts`, `backend/src/routes/gamification.ts`: aynı bağlantıda transaction yardımcı metodu eklendi. Market stoğu ve kullanıcı puanı koşullu atomik update; QR claim + puan award birlikte; oyun günlük limiti transaction advisory lock altında hesaplanıp yazılıyor. İstemci oyun skoru 0–1.000.000 aralığında tam sayı ile sınırlandı.
- `jukebox-web-controller/README.md` kanonik API origin/prefix davranışıyla güncellendi.

**Kontrol:** Backend TypeScript build başarılı. İlgili 6 test dosyası 55/55 geçti: admin guard, kiosk Spotify, upload imza denetimi, feed SSRF kontrolleri, gamification route/service. Lint hatasız; 56 uyarı raporlandı (çoğu önceden vardı; yeni dinamik dosya yolu kontrolleri için de güvenlik lint uyarıları var). Gerçek DNS/harici feed, Docker/Redis ve canlı HTTP topolojisi üzerinde smoke test yapılmadı.

**Açık P0 — kiosk provisioning:** Rehberin önerdiği 15 dakikalık tek kullanımlık provisioning kodu ve 24 saatlik cihaz kapsamlı, iptal edilebilir KIOSK credential henüz oluşturulmadı. Bu, mevcut frontend onboarding ve Socket.IO kimlik akışını da değiştirmeyi gerektiriyor. Şimdilik parolasız kiosk erişimi kapalı ve Spotify token endpoint'i korumalı; tam provisioning, sonraki Faz 0 işi olarak açık tutuldu.

Endpoint ve UI envanterleri hâlâ son adıma bırakıldı.

### Faz 1 — G3/G4 ve Socket.IO temel güvenliği

**Durum:** Uygulandı; pino adaptörü ve realtime rate limit dağıtımı sonraki kontrol maddeleri olarak açık.

- `backend/src/middleware/requestId.ts` eklendi. Her isteğe UUID atanıyor ve `X-Request-Id` response header'ı dönüyor.
- `backend/src/server.ts`: body limit 1 MB; `PATCH` CORS allowlist'e eklendi; query string içermeyen path, status, süre ve request ID alanları JSON structured log olarak yazılıyor. Beklenmeyen hata response'ları stack/SQL mesajı sızdırmadan `{ code, message, requestId }` döndürüyor. API GET istekleri 120/dk/IP limiter'ından geçiyor.
- `backend/src/middleware/rateLimits.ts` eklendi: auth 5/dk/IP, guest 3/saat/IP, kullanıcı write 30/dk, heartbeat 1/dk, admin 100/dk.
- Rate limit'ler auth register/login/refresh, guest, queue/vote, gamification redeem/register/claim/score/heartbeat ve jukebox admin router'ına bağlandı. Var olan genel 500/dk/IP limiti de korundu.
- `backend/src/socket.ts`, `backend/src/sockets/index.ts`: bağlantı için imzalı JWT veya etkin cihaza ait timing-safe kiosk credential zorunlu; oda katılımı admin, kendi kiosk cihazı veya etkin kullanıcı-cihaz oturumu ile sınırlı. Playback/heartbeat yalnız doğrulanmış kiosk'un kendi odasına yayınlanıyor. Playback sayıları ve heartbeat zamanı sınırlandırıldı; strict alan allowlist'i, DTO emit'i ve olay başına bağlantı rate limit'i eklendi. JWT ile bağlanan soket token süresi dolunca kapatılıyor.
- Kiosk ve admin Spotify device-auth başlangıcı GET'ten POST'a alındı. Kiosk parolası artık query string'e girmiyor; kiosk POST body'sinden doğrulanıp Spotify yönlendirme URL'i yanıtta veriliyor. İlgili kiosk/controller istemcileri güncellendi.
- Podcast feed yönetim router'ı mevcut admin guard'ına ek olarak admin rate limit kullanıyor. Süper oy günlük hakkı DB koşullu update ile tek seferde sahipleniliyor; eşzamanlı istekler aynı günlük hakkı iki kez kullanamıyor.
- `jukebox-web-controller/src/App.tsx` ve `kiosk-web/app.js`: Socket.IO handshake artık kullanıcı token'ı veya cihaz kimliği/credential gönderiyor.
- `jukebox-web-controller/src/App.tsx` ve `src/AdminDashboard.tsx` içindeki API mount yorumları, HTTP API'nin kanonik `/api/v1` origin'inde olduğunu belirtecek şekilde düzeltildi.
- Rehberde bağlantısı olmayan, yazılabilir `POST /api/v1/radio/history/:channelId` kaldırıldı; geçmiş yazımı istemciden gelen alanlar yerine sunucu içi `recordNowPlaying` akışında kalıyor. İstemci kullanımı bulunmayan `GET /api/v1/users/:id/stats` IDOR adayı kaldırıldı. `radio-profiles` yönetim router'ı ancak `RADIO_PROFILES_ENABLED=true` ile mount ediliyor; varsayılan kapalı.

**Kontrol:** Son değişikliklerden sonra backend `npm run build` başarılı; tam Vitest paketi 36 dosya geçti, 1 dosya atlandı; 301 test geçti, 3 atlandı. Web controller build ve testleri başarılı (29/29); kiosk testleri başarılı (39/39). `npm run lint` hata vermedi; 56 uyarı kaldı. Pino bağımlılığı mevcut backend'de kurulu olmadığından request/error logları JSON `console` ile yapılandırıldı. HTTP limiter store process-local; yatay ölçek için Redis store gerekir. Socket event limitleri de process/socket kapsamındadır. Socket.IO DTO'ları henüz tek bir Zod şemasına taşınmadı; gerçek socket entegrasyon testi yok.

**Açık rehber maddeleri:** Her endpoint için strict Zod şemaları ve admin audit log tamamlanmadı; G5 job kuyruğu/Redis, tek kullanımlık kiosk provisioning ve hash'li/iptal edilebilir cihaz credential'ı, client kaynaklı oyun skoruna sunucu oyun oturumu/nonce doğrulaması, QR nonce/imza, puan ledger'ı ve Faz 2/3 mimari taşıma sürüyor. Queue ekleme limit/duplicate kontrolleri ve oy yazımları da DB transaction/koşullu constraint ile tam yarış korumasına taşınmadı; süper oyun günlük claim'i yalnız kendisi atomik hale getirildi. Ses dosyalarında ffprobe ile gerçek container/audio stream ve 4 saat üst sınırı doğrulanıyor. Bunlar tamamlanmadan genel rehber tamamlandı sayılmayacak. Endpoint ve UI component envanterleri kullanıcı isteği gereği en son aşamaya bırakıldı.

### Son adım — endpoint ve UI envanterlerinin kaynak taraması

**Durum:** Tamamlandı; bu turun son dokümantasyon değişikliği.

- `docs/endpoint-envanteri.md`: server mount'ları ve tüm route dosyaları yeniden tarandı. Kanonik `/api/v1`, kiosk 308 geçişi, radio-profiles feature flag'i, Spotify POST başlangıç yolları ve kaldırılan endpointler düzeltildi; tüm router route'ları ve istemci eşleşmeleri eklendi.
- `docs/ui-component-envanteri.md`: mobil uygulama/navigasyon, controller React componentleri ve kiosk HTML/JS DOM yüzeyleri tarandı. Kiosk kurulum, Spotify başlangıç, kuyruk ve söz UI yüzeyleri ayrıştırıldı.
- Bu son envanter adımından sonra kaynak/test kodunda yeni değişiklik yapılmadı. Envanter, taranan istemci kaynaklarına dayalıdır; deployment/feature flag ve canlı erişilebilirlik ayrıca doğrulanmalıdır.

### Continuation — one-time kiosk provisioning (2026-09-24)

**Status:** Implemented and verified in source. This entry supersedes the earlier stale P0 note above.

- Added `kiosk_provisioning_codes` and `kiosk_credentials` tables to `backend/src/db/schema.sql`. Deployment must apply the schema with `cd backend && npm run db:migrate` before using this flow; no production database was changed here.
- Added admin-only `POST /api/v1/jukebox/admin/devices/:id/provision`. It returns a random code once, stores only its SHA-256 hash, expires after 15 minutes, and invalidates earlier unused codes for the device.
- Kiosk registration now consumes the one-time code transactionally and returns a random device-scoped credential. Only the credential hash is stored. The credential expires after 24 hours, renews on registration, and the kiosk renews every 12 hours. Admin logout-all revokes it and invalidates outstanding setup codes.
- Socket.IO and kiosk Spotify/device endpoints validate the active credential using a constant-time digest comparison. Kiosk setup no longer puts `pwd` in the URL; legacy `pwd` query parameters are scrubbed.
- AdminDashboard provides the one-time code and clipboard action. Added registration-flow and schema migration assertions.

**Verification:** Backend build passed; kiosk provisioning route suite passed (26/26); kiosk web suite passed (39/39); controller production build passed. The database migration has not been run against a deployment database.

**Still open:** Redis-backed job/rate-limit coordination, strict request schemas across all endpoints, queue/vote concurrency guarantees, server-verifiable game score sessions, signed/expiring QR reward issuance, admin audit trail, and the larger architecture phases. The points ledger already exists and is written by current reward flows; it is not an absent table. Endpoint and UI inventories are being refreshed as the final documentation action after this implementation.
### Continuation — queue and vote write serialization (2026-09-24)

**Status:** Implemented in `backend/src/routes/jukebox.ts`.

- Queue add now acquires transaction-scoped advisory locks for user/device, device/song, and guest fingerprint/day. User pending limits, guest daily limits, duplicate/recent-play checks, queue insertion, and add-stat updates run in one transaction. Competing requests for the same keys serialize; failed checks do not increment stats.
- Vote changes now lock the target queue row with `FOR UPDATE`, then read/update the user's vote, recompute totals, update aggregate scores/rank, and apply skip state in one transaction. Concurrent votes for one queue item serialize, and supervote claims roll back with a failed DB operation.
- Queue and vote HTTP paths and UI surfaces did not change; the existing inventories remain accurate for route/component coverage. Keep the requested full inventory scan as the final documentation action after the remaining plan work.

**Verification:** `backend` TypeScript build passed. No tests were run in this continuation.
### Follow-up — strict queue/vote inputs (2026-09-24)

- Added strict Zod request schemas to `POST /api/v1/jukebox/queue` and `POST /api/v1/jukebox/vote`. They reject unknown keys, malformed UUIDs, empty/oversized Spotify URIs, conflicting song selectors, invalid vote values, and missing targets before the write transaction starts.
- Validation is limited to these two high-contention write routes; strict schemas for the rest of the API remain open.
- `backend` TypeScript build passed. Per the current instruction, no tests were run for this continuation.
### Continuation — admin mutation audit trail (2026-09-24)

- Added `backend/src/middleware/adminAudit.ts`, which asynchronously writes authenticated admin mutations to the existing `audit_logs` table after the response finishes. It records actor, method category, route template/path, response status, and request ID.
- Request bodies, query strings, and IP addresses are deliberately omitted so credentials and personal network data are not copied into the audit trail. Audit insert errors are reported as sanitized structured context and do not change an already-sent response.
- Applied the middleware after authorization on jukebox admin, podcast-feed admin, optional radio-profile admin, and Spotify admin routes. Added the admin rate limit to radio-profile routes as well.
- `backend` TypeScript build passed. Tests were not run in this continuation. Existing endpoint and UI surface inventories need no route/component additions for this middleware; final source-wide refresh remains deferred until the remaining plan work is done.
### Continuation — gamification submission hardening (2026-09-24)

- Game score submissions now require a strict payload with bounded integer score, bounded round ID, plausible duration, and `mobile_game` source. The round ID, duration, and source are stored; a partial unique index allows only one submission per user/game/round. Duplicate retries return 409, and score/point writes remain in the same transaction. This provides replay protection; the score itself is still client-calculated and needs a server-verifiable gameplay protocol.
- Listening heartbeat ignores the legacy client `listened_seconds` value when calculating rewards. It serializes by user/content, accumulates at most 60 seconds per heartbeat from elapsed server time, and updates session plus point ledger in one transaction. Idle gaps over 10 minutes start a new session.
- `mobile/src/services/gamificationService.ts` marks `listened_seconds` optional/legacy. `schema.sql` adds the submission metadata columns idempotently for existing installations.
- `backend` TypeScript build passed. Tests were not run in this continuation.
### Continuation — signed QR reward tokens (2026-09-24)

- Added `POST /api/v1/gamification/admin/qr-rewards/:rewardId/token`, admin-guarded, rate-limited, and audit-logged. It issues a 15-minute signed token with a random nonce, capped at the reward end time.
- QR claims now strictly validate the request and verify the HMAC signature, expiry, reward ID, and nonce format before loading the reward. Claim and point-ledger writes remain transactional; the per-user unique claim constraint prevents replay by the same account.
- Signing uses a domain-separated HMAC key derived from `QR_REWARD_SIGNING_SECRET` or `JWT_SECRET`. Existing raw QR strings are no longer accepted; active printed QR codes must be reissued via the new admin endpoint. No production DB or QR artifacts were changed.
- The mobile claim call already submits the scanned value as `code`, so signed token strings use the existing client API shape. There is not yet a UI for admins to issue/display QR tokens.
- `backend` TypeScript build passed. Tests were not run in this continuation.
### Continuation — server-timed listening rewards and QR issuance (2026-09-24)

- Listening heartbeats now use a strict shape and a per-user/content PostgreSQL advisory lock. The server derives elapsed time from the previous heartbeat, credits at most 60 seconds per minute, closes the active accumulation window after 10 idle minutes, and writes reward/ledger updates in one transaction. Legacy `listened_seconds` remains accepted but is ignored for reward calculation.
- Added signed QR reward token issuance for admins and signature/expiry verification during claim. The issuance route is new and must be included in the final endpoint inventory. Existing raw QR codes need replacement; an admin UI for issuing/displaying reward tokens remains open.
- Together with the previous step, game submissions now require/store round metadata and reject duplicate rounds, but game score calculation is still not verifiable from server-side gameplay events.
- `backend` TypeScript build passed. Tests were not run in this continuation.
### Follow-up — strict gamification write inputs (2026-09-24)

- Added strict request validation and UUID parameter checks for market redemption, event registration, game score submission, listening heartbeat, QR claim, and QR token issuance. Unknown body properties are rejected; operations that take no body accept only an empty object.
- Reused current mobile score payload fields and retained the legacy listening duration as an ignored optional field for client compatibility.
- `backend` TypeScript build passed. Tests were not run in this continuation.
### Follow-up — server-issued arcade play sessions (2026-09-24)

- Added `POST /api/v1/gamification/games/:gameId/sessions` to issue authenticated, user/game-bound play sessions that expire after two hours. Score submission now requires an unused session UUID, derives duration from server time, and consumes the session in the same transaction as score and point writes. Database columns and a unique session index provide replay protection.
- Updated Snake, Memory, Rhythm Tap, Tetris, and Word Guess mobile flows to start a server session for every round and reuse that session when retrying a failed score submission. Gameplay waits for the session before accepting input or advancing timers.
- The score value remains client-calculated; session issuance and duration checks do not validate individual gameplay events or prove the claimed score.
- `backend` TypeScript build passed. Mobile app sources passed TypeScript checking with a temporary source-only config. A plain mobile `npx tsc --noEmit` also traversed existing `__tests__` and failed on missing Jest globals and stale tests for the removed client round-ID payload; no tests were run.
- The new session endpoint must be included when the endpoint inventory receives its final source-wide refresh.

### Follow-up — Redis-backed HTTP rate limits (2026-09-24)

- Replaced process-local counters for the global API limit and route-level auth, guest, read, write, heartbeat, and admin limits with a shared Redis fixed-window store when `REDIS_URL` is configured and reachable. Atomic Lua `INCR`/`PEXPIRE` ensures concurrent backend instances share counts.
- Redis initializes at server startup and closes during SIGINT/SIGTERM shutdown. If configuration or connectivity is unavailable, the limiter falls back to its per-process memory store and logs a sanitized warning; distributed enforcement is therefore temporarily unavailable during Redis outages.
- `backend` TypeScript build passed. No Redis container/service smoke check or tests were run in this continuation.
- This covers HTTP rate-limit coordination. Scheduled radio, podcast, and playback jobs are still process-local and need distributed job ownership/queueing before multi-instance deployment.

## G5 — Uzun HTTP işlemleri için BullMQ arka plan işleri (2026-09-24)

**Durum:** Uygulandı; Redis ile canlı kuyruk/worker smoke doğrulaması yapılmadı.

- `backend/src/services/backgroundJobs.ts`: BullMQ kuyruğu/worker'ı, retry/backoff, güvenli iş sonucu saklama ve job durum okuma eklendi. `REDIS_URL` gerekir; Redis yoksa kuyruk endpoint'leri 503 döner. API çalışır ancak uzun iş kuyruğa alınamaz.
- `backend/src/routes/jobs.ts` ve `backend/src/server.ts`: authenticated `GET /api/v1/jobs/:jobId` ile yalnız işi oluşturan kullanıcı veya admin durum/ilerleme/sonucu görebilir. Worker başlatma ve graceful shutdown eklendi.
- `POST /api/v1/jukebox/admin/scan-folder`, `POST /admin/process-song`, `POST /admin/sync-metadata` ve `POST /api/v1/podcast-feeds/sync` artık `202 Accepted` + `job_id` döndürüyor. RSS feed oluşturmanın ilk sync'i de kuyruğa alınıyor. Podcast feed ve sync payload'larında strict Zod kontrolü eklendi.
- Klasör tarama, ses işleme, metadata sync ve RSS feed sync worker içinde çalışıyor. Scan ve RSS işleri ilerleme yüzdesi bildiriyor; hata cevapları teknik path/URL ayrıntısını açığa çıkarmıyor.
- `jukebox-web-controller/src/AdminDashboard.tsx` scan, process ve metadata işleri için durum sorguluyor. Mobil `ProfileScreen` podcast sync sonuçlarını job tamamlanana kadar bekliyor; feed oluşturma ilk sync'in arka planda başladığını bildiriyor.
- `backend/package.json` / lockfile BullMQ ekini ve node-redis 5 uyumunu içeriyor. Mevcut `.env.example` içinde `REDIS_URL` örneği var.
- Kontrol: backend TypeScript build, web controller production build ve mobil kaynak TypeScript kontrolü başarılı. Test çalıştırılmadı. Redis bağlı canlı job akışı doğrulanmadı.
- Kapsam sınırı: düzenli podcast timer'ı job kuyruğuna iş ekliyor; radio history watcher ve Spotify reconciliation timer'ı hâlâ her backend sürecinde yerel timer. Çoklu instance'da bunlar için tekil scheduler/leader coordination ayrıca gerekli.

**Envanter:** G5 sonrası endpoint ve UI envanterlerine asenkron job durum akışı eklendi. Oyun alanları değiştirilmedi.

### Follow-up — strict request validation: account and profile routes (2026-09-24)

- `backend/src/routes/auth.ts`: registration, login, guest creation, and refresh bodies now use bounded strict Zod schemas. Unknown fields are rejected. Validation errors and login failures return stable sanitized responses; handler logs no longer include raw exception messages.
- `backend/src/routes/profile.ts`: profile customization updates now reject unknown keys, wrong value types, and overlong values before normalization.
- `backend/src/routes/radioProfiles.ts`: create/update, asset attach, device profile assignment, and device override bodies use strict schemas; path UUIDs and asset slot enum are validated.
- `backend/src/routes/spotify.ts`: Spotify app-config updates reject unknown keys and bound client ID/secret length; client secret remains write-only in the response mapper.
- Existing mobile and controller request shapes were checked against these schemas. `backend` TypeScript build passed. Tests were not run.
- Coverage is incremental: strict schemas have not yet been added to all remaining write routes. Game-related endpoints were excluded from this continuation.

**Envanter:** Endpoint envanterine bu grupların strict payload kuralları eklendi. UI envanterine, mevcut auth/profile/admin ekranlarının payload şeklinin korunduğu ve yeni UI surface eklenmediği kaydedildi.

### Follow-up — strict request validation: jukebox admin and moderation writes (2026-09-24)

- `backend/src/routes/jukebox.ts`: admin skip, local-song classification, device create/update, Spotify playback target, artist block, moderation settings, blocked keyword creation and moderation test now use strict bounded schemas.
- Device/song IDs on these writes must be UUIDs. Device fields have explicit limits, active/override flags require booleans, popularity is limited to 0–100, and moderation tests require text or both title and artist. Unknown keys are rejected.
- The existing route paths and client payload shapes are retained. No game route or game UI was changed.
- Backend TypeScript build passed. Tests were not run.

**Envanter:** Endpoint envanterine bu admin payload kuralları işlendi; UI envanterinde yalnız mevcut AdminDashboard ve moderasyon servislerinin değişmeyen UI yüzeyi olduğu belirtildi.

### Continuation — realtime socket validation and kiosk expiry (2026-09-24)

- `backend/src/sockets/index.ts`: device room IDs, playback progress, and kiosk heartbeat payloads now use strict Zod validation. Existing per-event rate limits, room membership checks, session ownership checks, and minimal emitted DTOs remain in place.
- `backend/src/socket.ts`: kiosk socket authentication now passes the credential expiry into the socket session, so the shared expiry timer disconnects both JWT and kiosk credential sessions at expiry.
- Backend TypeScript build passed. Tests were not run.

**Envanter:** Socket.IO REST dışı gerçek zamanlı yüzey olarak endpoint envanterinde açıklığa kavuşturuldu; UI envanterinde bağlantının mobil JukeboxView, controller JukeboxView ve kiosk üzerinden yapıldığı kaydedildi.

### Follow-up — strict jukebox user and kiosk inputs (2026-09-24)

- Connect/disconnect, kiosk register, now-playing, autoplay trigger, and song block writes now validate strict bounded bodies; kiosk registration accepts exactly one credential or provisioning code.
- Provisioning, logout-all, playback-state, song block, and blocked-artist ID parameters now require UUIDs. No game routes or game screens were changed.
- Backend TypeScript build passed. Tests were not run.

## Current scaffold status (2026-09-24)

The `backend-refactor/` directory is an isolated, non-production scaffold. Its app does not replace or mount into `backend/`; the current live application remains under `backend/`. The scaffold contains the shared core, module template, and an implemented Identity vertical slice with HS256 auth/admin guards. Other business modules remain templates or placeholders. The scaffold is not ready for production traffic; domain-by-domain migration and a deliberate database/token compatibility cutover remain open. Game-related migration is excluded from this work by the current request.

### Local verification

- `npm run lint` passes.
- `npm run typecheck` passes when a syntactically valid temporary `DATABASE_URL` is present for Prisma client generation; Prisma generation itself does not connect to a database.
- The layer-boundary check was exercised by temporarily adding an `@prisma/client` import to `identity.service.ts`; ESLint rejected it with both the service import restriction and unused-import rule. The temporary import was removed.
- Static scan found no `$queryRaw`, `$executeRaw`, runtime `process.env` reads outside the config module, or `child_process.exec` use under the scaffold source. `README.md` mentions `prisma db push` only to prohibit it.
- `_template/` files are intentionally reusable templates. They are not imported by the app. Current duplicate names across `backend/` and `backend-refactor/` reflect the deliberate side-by-side rollout boundary.
- No database migration was applied and no live app cutover occurred.

### Continuation — scheduler ownership for multi-instance deployments (2026-09-24)

- Added Redis lease coordination for periodic podcast feed enqueue, radio history polling/cleanup, and Spotify playback reconciliation. A single instance owns each task at a time; the lease renews while the task runs and is released only by its owner.
- Without `REDIS_URL`, the existing single-process local scheduling behavior is retained. If Redis is configured but unavailable, leased jobs are skipped instead of running concurrently on every instance.
- Backend TypeScript build passed. No Redis-backed multi-instance smoke test or tests were run.

### Continuation — duplicate Spotify endpoint removal and device PATCH semantics (2026-09-24)

- Removed unused duplicate `GET /api/v1/jukebox/admin/spotify-devices`; the controller's canonical source is `/api/v1/spotify/playback-devices`.
- Changed generic device partial updates from `PUT /api/v1/jukebox/admin/devices/:id` to `PATCH` and updated all four AdminDashboard calls. The request already applied partial fields with COALESCE semantics; schema validation remains strict.
- Tightened catalog search pagination/search bounds and lyrics query lengths/duration, and added strict kiosk Spotify token/auth/device registration bodies while preserving the current kiosk credential fields.
- Backend TypeScript build and controller production build passed. No tests were run.

### Follow-up — feed, radio and media input bounds (2026-09-24)

- Podcast feed deletion now validates the feed UUID before database access. Radio history channel IDs are bounded before their parameterized lookup; jukebox soft-delete song IDs require UUIDs.
- Lyrics lookup already used a fixed external provider, so it has no user-controlled destination URL. Its in-memory cache is now case/Unicode-normalized, size-bounded to 1,000 entries, and expires successful results after one hour and misses after five minutes.
- Backend TypeScript build passed. Tests were not run.

## Phase 2 — isolated Identity vertical slice (2026-09-24)

- Implemented `backend-refactor/src/modules/identity` register, login, guest, refresh-token rotation, and logout flows. Request bodies use strict schemas; auth and guest routes have separate rate-limit classes.
- The service depends on the repository port and Node cryptography only. Passwords use salted scrypt; refresh tokens are opaque, stored as keyed hashes, and rotated transactionally so concurrent reuse is rejected. Responses pass through an Identity DTO mapper.
- The Prisma `User` and `RefreshToken` models now represent UUID users, display name/role/guest state, and hashed refresh sessions. Replaced the scaffold's initial migration with SQL generated by Prisma from the schema. The migration has not been applied to a database.
- `backend-refactor/README.md` now distinguishes implemented Identity flows from still-placeholder auth guards and other modules. The module remains isolated and is not mounted into `backend/`.
- `backend-refactor` production build and lint passed; typecheck passed. No tests were run. No database connection or migration was performed.

### Identity core follow-up — access-token and admin guards (2026-09-24)

- Replaced the core authentication placeholder with HS256 token verification, expiration checks, a typed authenticated principal, and role enforcement. The admin router applies one injected-secret auth/ADMIN guard at its router boundary.
- Guard and Identity service contain no Prisma or Express imports in the service layer. The service-issued token format matches the core verifier.
- `backend-refactor` production build and lint passed after the change. No tests were run.

### Moderation regex safety follow-up (2026-09-24)

- Custom blocked keywords are now escaped as literal text before boundary matching, preventing stored keyword content from changing regex structure or causing catastrophic backtracking.
- Keyword and category input limits now match the database column sizes (100 and 50 characters).
- No game-related code was changed. Backend TypeScript build is being rerun with the final verification batch.

### Final verification batch (2026-09-24)

- `backend`: `npm run build` passed.
- `jukebox-web-controller`: `npm run build` passed after device-update calls moved to PATCH.
- `backend-refactor`: production build and ESLint passed; typecheck had also passed with a temporary local `DATABASE_URL` for Prisma generation.
- `git diff --check` passed; Git reported only the workspace's LF/CRLF normalization warnings.
- No test suites were run. No live Redis-backed lease/job smoke test or database migration was run.

### Queue access control — user policy confirmed (2026-09-24)

- `GET /api/v1/jukebox/queue/:deviceId` now returns queue data only to admins, users with a matching `device_sessions` row, or the matching active kiosk credential supplied in `x-kiosk-credential`.
- Kiosk queue polling now sends its stored credential in that header. CORS allows the header. Expired, revoked, inactive-device, or mismatched kiosk credentials do not grant access.
- Backend TypeScript build and controller production build are being rerun; no test suite was run.

### State correction and final verification (2026-09-24)

- The earlier “Current scaffold status” paragraph is stale: Identity is no longer a placeholder. The isolated `backend-refactor/src/modules/identity` slice implements register, login, guest login, refresh-token rotation, and logout; its HS256 access-token verifier and role guard are implemented as well. Other domain modules remain templates/placeholders, the scaffold is not mounted by `backend/`, and its migration has not been applied.
- Final verification after queue authorization: `backend` `npm run build` passed; `jukebox-web-controller` `npm run build` passed; `git diff --check` passed (Git emitted only LF/CRLF normalization warnings).
- No automated test suites, database migration, or live Redis multi-instance smoke test were run.

### Continuation — OAuth, auth and device-read hardening (2026-09-24)

- Spotify admin and device authorization now use 10-minute, single-use state records. State is SHA-256 keyed, consumed atomically before token exchange, and return-origin values are matched against the stored value. Both authorization paths use PKCE S256; the verifier is stored only for the short authorization window and sent to Spotify's token endpoint on callback.
- Callback, auth-start, device-auth start/status/delete, playback-device list, and token refresh requests now use strict bounded query/body/path schemas. Unexpected fields are rejected. Expired OAuth state rows are cleaned during state issuance.
- The OAuth-state and login-lockout tables are declared in the legacy backend's idempotent `schema.sql`. Deployment must run the existing backend schema migration before these new flows can be used; no deployment DB was changed here.
- Live Spotify playback snapshots now require the same device-read authorization as queues: admin, a matching user device session, or a valid active kiosk credential. Kiosk and controller clients send their stored kiosk credential or user bearer token respectively. Playback-state query parameters are rejected.
- Added Pino/Pino HTTP structured request logging. Request logs record method, query-free path, response status, request ID and duration while serializers omit request headers; sensitive key paths are configured for redaction. Spotify playback-device requests now use the shared admin rate-limit class.
- New account registrations require a 10-character password; duplicate-email failures use a generic response. Login failures are keyed by an HMAC of the account/identifier and locked after five failures for 15 minutes; unknown accounts receive a dummy bcrypt comparison. Guest IDs now use cryptographic UUIDs.
- Refresh rotation now locks and consumes the old row and inserts the next token in one DB transaction. Reuse of a signed refresh token revokes remaining sessions for that user.
- Added strict pagination schemas for podcast reads and strict empty/declared query schemas to radio, podcast-feed, jukebox catalog/admin and Spotify read routes. Jukebox session checks now use strict bodies; admin no-payload writes reject unexpected fields.
- Verification: backend build passed; 81 focused Spotify/device/migration tests passed, and 16 focused auth/schema tests passed. Scoped ESLint had no errors; existing warnings remain. Controller production build passed after the playback-state header update. No production schema migration or live Redis/Spotify smoke test was run.

### Continuation — profile PATCH, JWT algorithm pinning and health probes (2026-09-24)

- Profile customization writes now use `PATCH /api/v1/profile/me` and `PATCH /api/v1/profile/favorites`; the mobile profile service uses PATCH. The strict schema requires at least one declared field, and SQL upserts only fields present in the request so omitted values are preserved. Explicit `null` or blank strings still clear a supplied field.
- Access and optional-auth middleware now verifies HS256 only. Non-HS256 JWTs are rejected; a focused middleware test covers required and optional auth.
- Added public `/health/live` and token-protected `/health/ready`. Readiness checks database connectivity, upload directory writability, and configured Redis availability, and returns only a generic status. `HEALTHCHECK_TOKEN` is documented in `.env.example`; `/health` remains a liveness alias.
- Verification: backend TypeScript build passed; nine focused test files passed (94 tests); changed backend files linted with zero errors (warnings remain). Controller production build passed. Mobile has no build script; `npx tsc --noEmit` is currently blocked by pre-existing test typing errors, including stale game tests and podcast test typing. No game files were modified. No production database migration, live Redis probe, or Spotify smoke test was run.
- Remaining architecture work: migrate live domains into `backend-refactor` and cut over only after its Prisma schema/migration, legacy raw-SQL schema, existing user rows, and current access/refresh token formats have an explicit compatibility plan. No production schema/cutover was attempted. Game modules remain excluded.
- Removed the unused admin-only `POST /api/v1/spotify/refresh` endpoint after confirming no client calls it; token refresh remains a backend service operation. Backend build and 44 focused Spotify authorization/service tests passed after removal.
