# Backend refactor ilerlemesi

Bu kayıt, `Desktop/JukeBox Refactor` altındaki `backend-asset.md` adımlarının uygulanma durumunu ve her adımda değişen dosyaları tutar. Adımlar onay geldikçe sırayla ilerletilir. Endpoint ve UI component envanterleri, tüm refactor adımları tamamlandıktan sonra son adım olarak yeniden taranacaktır.

## Güncel kapsam özeti (2026-09-25)

- `backend-asset.md` içindeki Adım 1–5 tamamlandı; `how-to-backend.md` güvenlik ve hardening maddeleri mevcut `backend/` üzerinde uygulandı. Canlı Windows servisi mevcut `backend/` build'ini kullanıyor.
- `backend-refactor/` ayrı mimari scaffold olarak kaldı: Identity dikey dilimi var, diğer domain modülleri placeholder/template durumda. Bu scaffold'a canlı trafik geçişi yapılmadı; production cutover için tamamlanması gereken uzun vadeli refactor budur, mevcut canlı build'in çalışmasını engellemez.
- Canlı controller/API kontrolleri ve Socket.IO yol/auth smoke'u başarılı. Canlı oynatma önündeki açık işler: kiosk credential tabloları için yedeklenmiş DB migration, kiosk kaydı ve Spotify admin/device OAuth grant'leri. Ayrıntı `pre-live-release-checklist.md` içinde.

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

### Pre-live auth and readiness remediation (2026-09-25)

- Guest sessions now receive only a 24-hour access token; guest refresh attempts are rejected and legacy guest refresh rows are removed. The mobile auth context clears any prior refresh token when it starts a guest session.
- New access tokens carry `iss=radiotedu-api` and the configured `JWT_AUDIENCE`; refresh tokens carry the same issuer and the dedicated `radiotedu-refresh` audience. Both verifiers pin HS256 and check issuer/audience. `JWT_ALLOW_LEGACY_TOKENS=true` provides an explicit migration window for issuerless tokens and must be disabled after 30 days; tests passed with both new and legacy compatibility paths.
- The web controller now opts into a cookie auth transport. Access and refresh tokens are HttpOnly/SameSite=Strict cookies; refresh cookies are scoped to `/api/v1/auth`, logout revokes the stored refresh row and clears cookies, 401 responses attempt one cookie refresh, and the controller no longer writes access tokens to localStorage. CORS permits credentialed configured origins; Socket.IO accepts the scoped access cookie. Mobile bearer/refresh-body behavior remains supported, with guest refresh storage cleared.
- Readiness now includes DB, writable uploads, rate-limit Redis and BullMQ worker state. `/health`, `/health/live`, and `/health/ready` also mount under `PUBLIC_BASE_PATH` when configured.
- Added mobile `typecheck` for production app sources and fixed existing auth/podcast/QR test typings. Production-source typecheck passed; focused auth, podcast and QR tests passed. Whole-project `tsc --noEmit` now reports only the two stale game test type errors; game files were not changed under the no-games scope.
- Backend build passed; 81 focused backend auth, profile, migration, Spotify, and health tests passed after the final updates. Controller build and component tests passed (2 tests). `backend-refactor` lint, Prisma typecheck, and build passed with a temporary local URL; it remains deliberately unmounted and is not the release target.
- No hosted database migration or live service smoke test was performed: the configured Neon database is temporary, and Docker is unavailable for Testcontainers. See `docs/pre-live-release-checklist.md` for the safe release sequence and remaining environment gates.

### Database access discovery (2026-09-25)

- The user confirmed the configured Neon database is temporary, so it is not presumed to be staging or an authorized migration target.
- Local PostgreSQL is running as the `PostgreSQL-Custom` Windows service and listens on `127.0.0.1:5432`. The PostgreSQL client tools are installed. A read-only connection attempt as the default `postgres` role without a password was rejected; no PostgreSQL password file was found.
- The current process is not a Windows administrator, and the local PostgreSQL data directory is protected. No DB credentials were recovered, no schema or data was read from the local DB, and no migration/copy was run.
- The current backend environment lacks `REDIS_URL`, Spotify client credentials/callback, and `HEALTHCHECK_TOKEN`; no local Redis listener was found on port `6379`. Staging smoke tests need those environment values/services.
- Static migration review confirmed the default `db:migrate` applies the entire broad `schema.sql`, including unrelated out-of-scope domains. Added `backend/src/db/migrations/20260925_pre_live_auth.sql`, limited to the login-lockout and Spotify OAuth-state tables/indexes. Its device foreign key requires an existing `public.devices(id UUID)` table.
- Re-ran DB-independent auth/Spotify coverage after preparing the scoped migration: 4 focused test files passed (46 tests). These tests do not replace a target DB migration or staging smoke test.
- Local DB password recovery is a separate deferred task. Before applying the scoped SQL, confirm whether the target is local PostgreSQL or another staging DB, obtain authorized access, and take a backup. Data copy from temporary Neon is a separate choice and has not started.

### PostgreSQL transition attempt (2026-09-25)

- The user requested starting the move to the local PostgreSQL instance. The workspace still has only the Neon `DATABASE_URL`; no local target URL or `TARGET_DATABASE_URL` environment variable is configured.
- A read-only Neon metadata connection timed out from this environment. The local PostgreSQL service is running, but its target database credentials/name are not available to this process.
- No source/target tables or data were read, no backup was created, and no database was modified. The prepared scoped auth/OAuth SQL remains unapplied.
- Continue once local target connection details are made available in a gitignored local config (for example, `backend/.env.local`) and this environment can reach the source. Keep source and target URLs separate; verify both, back up before copying, and preserve the temporary Neon source.

### Local target connection verified (2026-09-25)

- `TARGET_DATABASE_URL` was added to the existing gitignored `backend/.env`; the local PostgreSQL connection succeeds.
- The configured URL currently selects the default `postgres` database, where the application `users` and `devices` tables are absent. A separate local `radiotedu` database exists and contains those tables, but the new auth-lockout and OAuth-state tables are absent there.
- No target was changed. Do not migrate into the default `postgres` database; confirm that `radiotedu` is the intended target and update the target URL before applying the prepared additive migration.
- The Neon source metadata connection still times out from this environment, so its contents cannot yet be compared or copied. No source data was read and no backup/restore was run.

### Local auth/OAuth schema applied (2026-09-25)

- Updated only the ignored `TARGET_DATABASE_URL` to select the existing local `radiotedu` database; the Neon `DATABASE_URL` remains unchanged.
- Created and validated a custom-format backup of only `public.users` and `public.devices` in the system temp directory. `pg_restore --list` confirmed both table definitions and data are present in the backup.
- Applied `20260925_pre_live_auth.sql` through the existing transactional migration runner with local SSL disabled for this connection. The first attempt could not open a connection because the Neon SSL setting was inherited, so no migration transaction or schema change occurred. The retry completed successfully.
- Verified `users`, `devices`, `auth_login_attempts`, and `spotify_oauth_states` exist in `radiotedu`. User and device row counts remained 133 and 4. No game tables were read or changed.
- The direct `pg` connection to Neon timed out, but the application's `@neondatabase/serverless` driver connected successfully. No Neon data was copied and the app's primary `DATABASE_URL` was not switched. Full PostgreSQL cutover and DB/Redis/Spotify smoke checks remain open.

### Source/target comparison and local API smoke (2026-09-25)

- Read-only comparison of non-game Jukebox tables found Neon/local counts of users `8/133`, devices `2/4`, songs `39/92,595`, and queue rows `67/102`. User, device, and song IDs had zero overlap; no row values or game tables were read.
- A temporary local app smoke test against `radiotedu` returned `200` for `/health/live` and `GET /api/v1/jukebox/songs?page=1` (20 catalog entries).
- The local schema-only auth/OAuth migration is in place and existing user/device counts remain unchanged. The local app database is usable, but switching the primary `DATABASE_URL` without a decision on Neon-only records would leave those separate records behind. Both databases remain intact; no data merge or primary URL switch was made.

### Local PostgreSQL selected; Neon test data excluded (2026-09-25)

- The user confirmed the Neon records were test data and do not need to be imported. `backend/.env` now points the primary `DATABASE_URL` to local `radiotedu`; `DB_SSL=false` is set for the local connection, and the prior Neon URL is preserved as `NEON_TEST_DATABASE_URL`. The file remains gitignored.
- Verified the primary connection resolves to `radiotedu` with both auth/OAuth tables present. Repeated local API smoke through the primary configuration: `/health/live` and `GET /api/v1/jukebox/songs?page=1` both returned 200, with 20 catalog entries.
- No Neon rows were copied; local users/devices/songs remain intact. Redis/BullMQ and Spotify smoke checks remain open because their local environment values/services are not configured.
- User-panel source scan found only `GET /api/v1/users/leaderboard` in the users router. The controller's `LeaderboardView` is a ranking modal, not an account directory; there is no admin user-list endpoint or panel.

### Local service configuration and auth smoke follow-up (2026-09-25)

- Correcting the prior entry: the ignored local `backend/.env` now has Redis and Spotify settings. Redis at `localhost:6379` returned `PONG`; Spotify client credentials returned HTTP 200 from the token endpoint. No Spotify authorization state was created and no account was connected.
- The configured callback is `https://radiotedu.com/jukebox/api/v1/spotify/callback`. Its registration in the Spotify developer dashboard and interactive admin/device authorization remain unverified. The backend route is mounted at `/api/v1/spotify/callback`; the external `/jukebox` prefix must be forwarded by the site proxy as documented.
- Generated a 64-character local `HEALTHCHECK_TOKEN` in the ignored `.env`; its value was not printed or added to tracked files. `/health/ready` returned 200 in a test-mode smoke with local DB, uploads, and Redis rate-limit connectivity. Test mode deliberately reports background jobs ready without a BullMQ worker, so production-mode worker readiness remains unverified.
- Verification in this session: backend `npm run build` passed; 4 focused backend files passed (17 tests); controller `App.component.test.tsx` passed (2 tests) and `npm run build` passed. No test changed or read Games data.
- The isolated `backend-refactor` scaffold passed `npm run lint` and `npm run build` in this session; Prisma Client generation used the local URL only for schema generation. No migration or database connection/cutover was run. Identity is still the only implemented business slice; the scaffold remains unmounted and is not ready to replace `backend/`.
- `git diff --check` passed after the documentation updates; Git emitted only LF/CRLF normalization warnings.
- Did not start the normal backend process because startup consumes BullMQ jobs and runs periodic Spotify/device reconciliation against the local DB. Review the queue and active devices before a non-test worker smoke. Staging/prod DB migration, Spotify dashboard callback confirmation, interactive OAuth, reverse-proxy cookie/Socket.IO verification, and true non-test readiness remain release gates.

### BullMQ compatibility and public route follow-up (2026-09-25)

- The local Redis service answers `PING` but reports Redis `3.0.504`; BullMQ requires Redis 5 or newer. The queue was empty at the read-only precheck. A brief non-test worker probe exposed this incompatibility and was stopped; it did not process any jobs.
- Hardened `backgroundJobs.ts`: it reads the Redis server version before constructing BullMQ, waits for the worker's ready signal, and reports false readiness when Redis is unsupported or the worker errors. Unsupported Redis is logged as `unsupported_redis_version` instead of starting an error/retry loop. The non-test local readiness endpoint returns 503 with this service.
- Added coverage for supported/unsupported Redis version parsing. Backend build passed; focused worker-version and health tests passed (8 tests).
- Spotify's authorization endpoint accepted the configured admin callback and derived device callback in non-interactive PKCE preflights (HTTP 303). A GET to the public callback route without OAuth state/code returned the backend's expected 400; no Spotify login or account grant was performed.
- Public/local IIS proxy probe: `/jukebox/health` returned 200, while `/jukebox/health/live` returned 404. Updated the machine-level `C:\inetpub\wwwroot\web.config` health rule to forward `/health`, `/health/live`, and `/health/ready` to port 3000; saved the original as `C:\inetpub\wwwroot\web.config.pre_live_health_20260925-201310.bak`. The check still returns 404 because the currently running backend on port 3000 is an older build that only exposes `/health`; update/restart that backend before considering the route fixed.
- Public CORS preflight to `OPTIONS /jukebox/api/v1/auth/login` returned 204 but omitted credential support, `PATCH`, `x-auth-transport`, and `x-kiosk-credential`; the deployed headers do not match the current backend source. Controller cookie auth and kiosk credential requests are not verified on the public deployment and likely fail until the hosting deployment/proxy is updated.
- No modern Redis package/service, staging proxy configuration, Spotify user session, or admin/device credentials are available here. The Redis service upgrade and interactive OAuth/cookie/Socket.IO checks remain open.
- A source audit found the access cookie was scoped to `/api/v1`, which excludes both public `/jukebox/api/v1` requests and `/jukebox/socket.io`. Updated cookie path resolution to use the public base path (or `/` at the root) and added test coverage for the API/Socket.IO path relationship. The refresh cookie now follows the prefixed `/api/v1/auth` path too. The local `.env` publishes under `/jukebox` to match the public site; this code/config has not been deployed.
- The current source CORS middleware already allows credentials, `PATCH`, `x-auth-transport`, and `x-kiosk-credential`; public preflight still lacks those headers because port 3000 is serving an older backend process. The current backend was not restarted or deployed because its Redis endpoint is unsupported for BullMQ and deployment readiness is not yet met.

### Release-blocker triage update (2026-09-25)

- Re-ran backend build and focused auth/CORS/health/BullMQ tests after the cookie-path and worker-readiness changes; results are recorded below.
- Corrected `08-full-project-technical-report.md`: public `/jukebox/api/v1/*` is translated by IIS to backend `/api/v1/*`; backend does not mount API routes a second time under `/jukebox`.
- The source changes and local IIS health rewrite are prepared, but no deployment/restart was performed. The existing port-3000 process still serves stale routes and CORS behavior.
- Release is still blocked on a supported Redis 5+ service (current Redis is 3.0.504), a controlled deployment/restart window for the stale backend, target/staging verification, and interactive Spotify authorization plus cookie/Socket.IO browser checks. These require host/service access and account interaction unavailable in this workspace.
- Verification result for this triage: `backend npm run build` passed; focused `apiIntegration`, `authRegister`, `backgroundJobs`, and `utilityRoutes` suites passed (26 tests total); `git diff --check` passed with only Git LF/CRLF normalization warnings.

### Jukebox live toggle readiness scan (2026-09-25)

- Read-only public probes: `/jukebox/`, `/jukebox/kiosk/`, and `/jukebox/api/v1/jukebox/songs?page=1` returned HTTP 200. `/jukebox/health` returned 200; `/jukebox/health/live` returned 404.
- Public CORS preflight returned 204 but omitted `PATCH`, credentials, `x-auth-transport`, and `x-kiosk-credential`; the controller auth request path is not release-ready.
- IIS and local port 3000 are active. Port 3000 is owned by `node.exe`, parented by automatic Windows service `RadioTEDU-Jukebox` (LocalSystem). WinSW XML starts `backend/dist/server.js` from this repo; logs go to `C:/ProgramData/RadioTEDU/jukebox/logs`; stop timeout is 20 seconds. No stop/restart was attempted. The off/on runbook records the service mapping.

- No live configuration change was made in this scan. Do not stop IIS or kill the Node PID as a substitute for the Jukebox service's graceful shutdown.
- Read-only service discovery identified automatic Windows service `RadioTEDU-Jukebox` (LocalSystem), launching this repo's `backend/dist/server.js`; 20-second stop timeout. A clean TypeScript baseline build from commit `928ece2d` was stored at `C:/RadioTEDU/backups/20260925-jukebox-baseline-r928ece2d/dist` with SHA-256 manifest. This is not a byte-for-byte capture of the currently running process. Redis 3.0.504 remains incompatible; no restart or traffic change was performed.
- Checked webroot backups and release folders: the September 19 `jukebox_backup` is static-only, and no backend release snapshot matching the active service was present. The HEAD rollback build is therefore a source baseline, not the exact old runtime binary. Immediate next step remains supported Redis 5+ provisioning; then a brief controlled `RadioTEDU-Jukebox` restart and public verification can apply the source fixes.

### Redis endpoint preflight (2026-09-25)

- Corrected the earlier Redis blocker state: Memurai Redis API 8.2.10 is installed as an automatic Windows service on port 6380. `PONG`, node-redis `INFO server`, and BullMQ Queue `waitUntilReady()` passed using the ignored backend `.env` after its single `REDIS_URL` line was switched to 6380.
- The existing 6379 Redis and `RadioTEDU-Jukebox` Windows service remain Running; no live process restart was performed. The active backend does not read the changed `.env` until restart, so public behavior remains on the old process for now.
- The remaining technical deployment step is a controlled `RadioTEDU-Jukebox` restart (brief API/kiosk interruption), followed by production health/CORS/cookie/socket verification. The rollback source baseline and manifest are prepared under `C:/RadioTEDU/backups/20260925-jukebox-baseline-r928ece2d`.

### Controlled restart attempt (2026-09-25)

- Requested restart of only `RadioTEDU-Jukebox`; Windows returned `Cannot open ... service` / access denied before stopping it. No service interruption occurred.
- Verified afterward: `RadioTEDU-Jukebox`, old Redis, and Memurai are all Running; local backend `/health` still returns 200. The ignored `.env` points to Memurai 8.2.10 on 6380, but the active process has not reloaded its environment.
- User action required: from an elevated PowerShell session on the server, run `Restart-Service -Name 'RadioTEDU-Jukebox'`, wait for Running, and notify me. Do not restart IIS or stop the legacy Redis service. I will immediately verify public liveness/readiness, CORS, controller auth, kiosk and Socket.IO.

### Post-restart live smoke (2026-09-25)

- The user ran the requested restart command. WinSW reported `The handle is invalid` during its stop handling, but Service Control Manager applied the configured recovery action and restarted `RadioTEDU-Jukebox`; current service state is Running. IIS and Redis 6379 stayed Running.
- The restarted Node process startup log reports `rate_limit_redis_ready` and `background_jobs_ready`. Memurai at 127.0.0.1:6380 returns `PONG`; backend `.env` selects this endpoint.
- Local IIS routes `/jukebox/`, `/jukebox/kiosk/`, `/jukebox/health`, and `/jukebox/health/live` returned HTTP 200. Protected `/jukebox/health/ready` returned 200 with the configured `HEALTHCHECK_TOKEN`; no-token 404 is intentional.
- Login OPTIONS preflight returned 204 with credentials, PATCH and required `x-auth-transport`/`x-kiosk-credential` headers. This closes the previously recorded stale-process/CORS blocker for local IIS.
- Not yet verified: real browser controller cookie login, authenticated Socket.IO, intended hostname from an external client, staging/production migration, and interactive Spotify admin/device grants. No database or Spotify account state was changed.
- Follow-up after the user entered and refreshed the controller: live backend logs show `POST /api/v1/auth/guest` returned 201 and `POST /api/v1/jukebox/connect` returned 200. After refresh the user still saw the signed-in guest, confirming auth-cookie session restore. The selected device code is not restored by the current UI and must be entered again; authenticated Socket.IO remains to be checked.
- After the user re-entered `KOLEJ`, connect returned 200 and queue reads succeeded. The Socket.IO polling handshake initially returned 404 through IIS: the proxy removed `/jukebox` although the active app/client socket path is `/jukebox/socket.io`. Updated the single `JUKEBOX_SUBDIR_SOCKET_PROXY` action in machine-level `C:/inetpub/wwwroot/web.config`; saved exact pre-change copy as `C:/inetpub/wwwroot/web.config.pre_live_jukebox_socket_20260925.bak`. Local IIS handshake now returns 200 with an Engine.IO session. Authenticated browser socket connect/device-room join still needs verification.
- Completed an authenticated Socket.IO smoke through IIS using a short-lived in-memory token for an existing `KOLEJ` device session. The client connected and emitted `join_device`; backend logs confirmed `socket_connected` with guest role and `socket_joined_device`. No persistent DB changes were made. This validates the IIS route, token verification, and room guard; the user still needs to confirm the controller screen itself looks connected.
- Read-only inspection of the service's active `radiotedu` DB found `devices` exists but `kiosk_provisioning_codes` and `kiosk_credentials` do not. Prepared idempotent scoped migration `backend/src/db/migrations/20260925_kiosk_credentials.sql`; it has not been applied. A database backup must be taken and validated before applying it, then kiosk registration/credentialed playback can be verified.
- User confirmed the controller displays `KOLEJ` and pending `Howlin' for You`. Source renders `Müzik sırası boş` from `nowPlaying === null`, independently of `queue.length`; therefore the queued song is waiting and playback has not started. No playback action was triggered in the verification.
- Found PostgreSQL 18.1 backup tools under `C:/PostgreSQL/bin`. Created a full custom-format backup at `C:/RadioTEDU/backups/20260925-radiotedu-pre-kiosk-migration.dump` (13,618,236 bytes; SHA-256 `783D21264D2767D8C9330E567BD093B2B80F84B51E73343E3E785124366D7D59`); `pg_restore --list` validated the archive.
- Applied only `backend/src/db/migrations/20260925_kiosk_credentials.sql` to active database `radiotedu`; the migration completed in a transaction and `to_regclass` verified both kiosk tables. The migration selector environment variable was cleared afterward. `RadioTEDU-Jukebox`, Memurai, and legacy Redis remain Running; `/jukebox/health/live` is 200.
- The active device `KOLEJ` has no valid kiosk credential and `spotify_player_is_active=false`. Next: admin one-time kiosk provisioning, kiosk registration, Spotify device OAuth, and actual playback verification. No Spotify grant or credential was issued by this agent.

### Admin access and kiosk onboarding follow-up (2026-09-25)

- At the user's request, created a separate admin account in the active `radiotedu` database. Verified the persisted bcrypt hash and successful cookie-authenticated login through public IIS. The plaintext password is not stored in this repository.
- Used the admin API to issue a single-use, 15-minute `KOLEJ` kiosk provisioning code. The database stores only its hash. The plaintext was handed to the user in chat; do not reuse it or store it in project files.
- Public `/jukebox/health/live` returned HTTP 200. Authenticated public admin-device and Spotify status routes returned HTTP 200.
- Current Spotify status: no admin OAuth grant and no device OAuth grant for `KOLEJ`. The kiosk has not consumed its one-time provisioning code, so no kiosk credential or playback test can complete until the physical kiosk is set up.
- Remaining live actions requiring the user's device/account: enter the current provisioning code on the physical `/jukebox/kiosk/` screen, then authorize the intended Spotify account for the admin and kiosk device, and confirm the queued song plays. The provisioning code expires 15 minutes after issuance.

### Device/Spotify tests deferred (2026-09-25)

- User said Spotify authorization tests can wait and the physical kiosk cannot be connected now. The issued 15-minute code should be treated as expired by the time kiosk setup resumes; issue a fresh code then.
- Remaining non-Spotify test is physical kiosk enrollment followed by credentialed heartbeat/playback-state verification. The provisioning endpoint itself has already been exercised through the authenticated live admin API.
- Previously recorded health, CORS/auth, controller session, device/queue, Socket.IO, Redis/BullMQ, DB migration, build, and focused automated checks remain passed. No Spotify or actual playback check is claimed as complete.
- At the user's request, issued a fresh one-time `KOLEJ` setup password through the authenticated public admin API. This replaced the previous code; its plaintext is shared only in chat and it expires after 15 minutes.

### Kiosk setup login path fix (2026-09-25)

- Investigated the user's kiosk setup failure. `kiosk-web/config.js` selected the site origin as `API_URL`, causing the kiosk under `/jukebox/kiosk/` to post registration to root `/api/v1/...`. The active IIS/API path is `/jukebox/api/v1/...`; the root path returned the legacy `INVALID_PASSWORD` response. The current one-time provisioning code remained unused and valid at inspection.
- Updated kiosk API base URL to include the detected public base path. The `/jukebox/kiosk/config.js` public asset returned HTTP 200 with the updated prefix. The correct prefixed registration route returns the expected 400 validation response when sent an empty body, confirming it reaches the intended handler.
- The last logged kiosk registration attempt returned HTTP 400 before the path fix; DB state shows the one-time code remains unconsumed. No registration request has reached the backend since the fix, so the fixed client path still needs a retry.
- Updated the UI component inventory. The user should force-refresh the kiosk page and retry with `KOLEJ` and the existing one-time code before its 15-minute expiry; no new code was issued and no kiosk credential was created by this diagnostic.

### Public kiosk registered (2026-09-26)

- User confirmed the kiosk page now shows Queue ready, location `Kolej`, the pending song, and the Spotify connection prompt.
- Active DB verification: `KOLEJ` is active; kiosk credential is unrevoked and valid; heartbeat is current; one queue item is pending. Spotify playback target remains unset/inactive.
- Public health live returned 200; protected health ready returned 200. Backend/API and kiosk connection checks are complete for the current public service. Spotify OAuth and actual Spotify playback remain deferred as requested.
- The public Jukebox is already serving traffic; no deployment/restart is needed for this kiosk configuration update. Full Spotify playback should not be described as live-ready until the intended Spotify account is authorized and playback is confirmed.

### Backend refactor implementation continuation (2026-09-26)

- User directed that the backend refactor be completed, while keeping game-related work out of scope. The production Windows service still runs `backend/`; no service restart, database migration, or production cutover was performed.
- `backend-refactor/` now has working Identity, `/api/v1/users/me`, public `/api/v1/podcasts`, `/api/v1/radio/status`, `/api/v1/radio/schedule`, `/api/v1/radio/history/:channelId`, `/api/v1/jukebox/devices`, `/api/v1/jukebox/kiosk/register`, `/api/v1/jukebox/connect`, `/api/v1/jukebox/disconnect`, `/api/v1/jukebox/queue/:deviceId`, and admin kiosk provisioning at `/api/v1/admin/jukebox/devices/:id/provision` plus legacy path `/api/v1/jukebox/admin/devices/:id/provision`. Device discovery and kiosk registration use strict input schemas; kiosk credentials/provisioning are hashed, constant-time checked, single-use, transactional, and expire/renew for 24 hours. Queue reads require admin access, a connected user/device session, or a valid active kiosk credential; queue rows preserve the existing playback DTO fields and hide jingle/ad items from the public queue. Device responses exclude the legacy plaintext device password. User-facing shapes for these routes preserve the existing success/data/message contract.
- Added the shared kiosk credential hashing helper and `RADIO_STREAM_URL` configuration. Wired the devices, users, and radio modules through the composition root.
- `podcasts` now has paginated public episode listing (`page`, `per_page`, max 50) with stripped HTML excerpts and feed metadata. The central admin router now enforces auth + ADMIN role, 100 requests/minute, and records method/path/status/request ID to `audit_logs`; kiosk provisioning is mounted under this guard and keeps a legacy protected alias at `/api/v1/jukebox/admin/devices/:id/provision`.
- Verification: `backend-refactor` `npm run build` passed with a temporary local `DATABASE_URL` (Prisma client generation + TypeScript compile); `npm run lint` passed. No integration database was contacted and no tests were run.
- Remaining before backend refactor completion: catalog search/classification/moderation, queue writes/voting and playback-state operations, Spotify OAuth/token/device integration, podcast/feed APIs with SSRF-safe fetch and queued jobs, radio profiles, admin use cases/audit, comprehensive legacy Prisma schema/migration baseline, and production/staging parity and cutover checks. The current initial migration is not safe to deploy to an existing database as a baseline. Endpoint and UI inventories remain intentionally deferred until the final refactor scan, per the user's instruction. Game/gamification routes and data remain excluded.

### Backend refactor continuation: catalog and queue operations (2026-09-26)

- Connected the catalog module to the composition root and mounted it under the legacy `/api/v1/jukebox` prefix. Local catalog reads and Spotify search are filtered through explicit moderation policies; Spotify app secrets from the database are decrypted only through the secret-box adapter. Spotify catalog support is not Spotify OAuth or playback integration.
- Added authenticated `/api/v1/jukebox/queue` and `/api/v1/jukebox/vote` handlers with strict schemas and repository transactions. Queue insertion checks active device, user session, public/active/unblocked music asset, per-user pending limit, duplicate pending entries, and recent playback. Voting toggles a user's -1/1 vote, recomputes totals/priority and skips items at score <= -5.
- Corrected a Prisma relation error involving guest daily song limits. Regenerated the initial migration from the current Prisma schema. It remains a from-empty bootstrap migration and must not be deployed over the existing production database; no database was contacted or changed.
- Added radio-profile admin operations for list/create/get/update/delete, jingle/ad asset attachment, device profile assignment, and per-device overrides. They are mounted behind the central ADMIN guard at `/api/v1/admin/radio-profiles`; the legacy `/api/v1/radio-profiles` path remains guarded and supported. Asset attachment accepts only active, unblocked hidden local songs with a matching `jingle` or `ad` role.
- Build, lint, and Prisma schema validation passed after catalog, queue-write/vote, and radio-profile wiring. The Prisma initial migration was regenerated from the current schema. Raw SQL API calls remain absent from `backend-refactor/src`; no tests were run.
- Remaining backend work includes preserving full legacy behavior for Spotify URI queue-add and supervotes, kiosk heartbeat/now-playing/playback-state/Spotify device authorization, playback and queue realtime events, catalog and moderation administration, device administration, radio-profile CRUD/assignment, podcast-feed CRUD and SSRF-safe queued synchronization, `/api/v1/jobs/:jobId`, Spotify OAuth and player operations, legacy schema compatibility/baseline strategy, deployment parity, and live-token/cutover verification. Inventories have not been updated yet because the user requested the final inventory scan only after the backend work is complete. Game/gamification remains excluded.

### Backend refactor continuation: jobs, feeds, device administration, moderation, kiosk and realtime (2026-09-26)

- Added SSRF-restricted RSS/Atom fetching with DNS pinning, private/mapped IP rejection, redirect and size limits, timeout, content-type checks, and XML external-entity processing disabled. Feed CRUD enforces per-owner reads/deletes; synchronization is queued through BullMQ and exposed through owner/admin job status. Repeated sync requests now receive unique job IDs so completed jobs do not suppress later syncs.
- Added guarded device administration (CRUD, revoke sessions/kiosk credentials, playback target and provisioning), kiosk heartbeat and now-playing reports, moderation administration, and catalog song administration (list, classification and soft-block). The latter routes are attached only below the central admin guard, with a protected legacy API alias.
- Added guarded admin force-skip and Spotify playlist preview operations; playlist lookup uses the Spotify Web API adapter with bounded URI parsing and timeout. Pino HTTP logs redact authorization, cookies and kiosk credentials.
- Added authenticated Socket.IO device-room membership for JWT sessions or device-scoped kiosk credentials; membership is checked against active device/session state. Queue updates send the current legacy-compatible queue DTO; skip and force-logout events are emitted through a realtime adapter.
- User-write rate limiting now keys on authenticated user ID (IP for unauthenticated requests). The Docker context now excludes local secrets and generated/build artifacts.
- Verification: Prisma generation + TypeScript build passed; ESLint passed; the focused SSRF feed-fetcher suite passed (4 tests). Prisma schema generation used a placeholder URL and did not connect to a database. No database migration, API server startup, production service change, deployment or Spotify account authorization was performed. `npm install` added the planned XML/IP and Socket.IO dependencies; npm reported four high-severity dependency advisories, which remain to be reviewed.
- The refactor is still incomplete and is not a production replacement. Remaining implementation includes Spotify OAuth/token storage and playback/device-auth APIs; full kiosk playback-state/autoplay/lyrics behavior; playlist preview, sync-metadata and song-processing job implementations; secure audio/avatar upload and storage; profile/avatar/stats parity; complete admin/realtime event parity; and legacy contract coverage. The current initial migration is a from-empty bootstrap rather than a verified baseline for the existing database. Local Redis is 3.0.504, below BullMQ's required Redis version, and the refactor service has not been deployed or cut over. Endpoint and UI inventories remain deferred until the final implementation scan. Game/gamification remains excluded.

### Backend refactor implementation completion pass (2026-09-26)

This entry supersedes earlier continuation entries above that describe the refactor modules as missing or incomplete. The staged non-game implementation work is now present in `backend-refactor/`; the production backend remains active and was not changed by this pass.

- Added the missing kiosk autoplay trigger at `POST /api/v1/jukebox/autoplay/trigger`. It requires a valid, active, unexpired device-scoped kiosk credential (preferred `x-kiosk-credential` header, plus the existing kiosk client's `device_pwd` POST-body compatibility field; query-string secrets are rejected); validates the strict `{ device_id, device_pwd? }` body; applies a one-per-device-per-minute limit; resolves a device override or assigned radio-profile playlist; filters explicit and moderation-blocked tracks; falls back to an eligible managed local song when no playlist is configured or Spotify returns no eligible tracks; and atomically avoids enqueueing when a queue item is already pending. Song play counts, last-played time, and playlist history update when playback starts. Spotify or playlist failures return a controlled service-unavailable error.
- Added bounded Spotify playlist-track retrieval through the Spotify catalog provider port. No Spotify account, kiosk device, or live playback was used.
- Added focused autoplay service coverage for credential forwarding, explicit/moderation filtering, queue event publication, and the no-playlist case.
- Current validation: `npm run build` passed; `npm run lint` passed; `npx prisma validate` passed; `npm test -- --reporter=dot` passed (3 files, 9 tests). Build/schema generation used a placeholder PostgreSQL URL and did not connect to a database.
- No `NotImplementedError` remains in a mounted feature module; the only implementation placeholders are deliberately unmounted `_template` files. The source scan confirms `process.env` is read only in `core/config/env.ts`; no `db push`, raw Prisma SQL, `child_process.exec` or `execSync` appears in the refactor source. Duplicate source basenames were not found.
- The backend implementation remains staged and has not been deployed. Go-live still requires read-only legacy schema comparison and an approved migration-baseline plan (the initial migration is from-empty and cannot be run against the existing database), deployed Redis 5+ (the local Windows Redis is 3.0.504; Docker Compose uses Redis 7), production environment/secret configuration, staging contract run, and a real Spotify account/device authorization and playback check. No production database, service, or route was modified.
- This was the last implementation update before the requested final endpoint and UI inventory scans. Those inventories are updated in the final source-scan section below.
- Games and gamification remain excluded.
### Backend refactor follow-up: contract hardening and generated API docs (2026-09-26)

- Corrected podcast-feed access to match the active backend: feed management stays behind the admin guard and admin users see/manage the full registry, not only feeds they created.
- Consolidated current-user profile data with `GET /users/me?include=profile`; legacy profile routes remain protected aliases. Duplicate registration keeps the legacy generic 400 response and does not reveal account existence.
- New account passwords use Argon2id. Existing bcrypt/scrypt hashes are verified and upgraded to Argon2id after a successful login.
- Added a provider playback port and Spotify adapter. Added the provider-shaped admin playback-target PATCH while retaining the current Spotify-specific PUT path for clients.
- Audio file processing now runs ffprobe through `spawn` with shell disabled, timeout/output bounds, stream/container validation, and a four-hour duration cap. The Docker runtime installs ffmpeg; local execution needs `ffprobe` on PATH or `FFPROBE_PATH`.
- Added Zod-backed OpenAPI generation at `backend-refactor/docs/openapi.json` (`npm run openapi:generate`).
- Added admin router authorization/audit integration tests and audio inspection tests. Verification: build and lint passed; 6 test files / 17 tests passed; Prisma client generation passed using a placeholder URL. No database connection, migration, deployment, or service restart occurred.
- Remaining boundary: initial Prisma migration is still a from-empty bootstrap. Existing-database schema parity and the safe baseline/cutover must be handled against an explicitly selected database; this implementation pass made no DB changes. Redis 5+ and live Spotify authorization/playback remain staging/runtime checks. Game/gamification source was excluded.

- Final follow-up: ffprobe inspection now runs before a new audio upload is persisted, so invalid media is rejected before creating the managed file or catalog row. Final verification after this change: build/lint/Prisma validation passed and all 18 tests passed.

### Refactor parity and final implementation pass (2026-09-26)

- Re-audited mounted non-game endpoints and active kiosk/socket contracts. Kept the refactor isolated; the production `backend/` service, production database, and live traffic were not changed by this pass. Game/gamification work remains excluded.
- Preserved the active kiosk Socket.IO protocol: `join_device` accepts the legacy raw UUID as well as `{ device_id }`; `leave_device`, `playback_progress`, and `kiosk_heartbeat` are validated, scoped to the authenticated kiosk/device room, and rate limited. The server Socket.IO path now follows `PUBLIC_BASE_PATH`, matching subdirectory deployments.
- Kiosk heartbeat now verifies the scoped credential, records liveness, and performs throttled Spotify playback reconciliation. When an ended Spotify track is detected it finalizes the playing queue row, starts the next eligible track or triggers autoplay, and publishes the resulting queue. Errors from Spotify do not disconnect a healthy kiosk heartbeat. Added the recovery path as service/repository/provider operations.
- Restored radio-profile automation on normal music completion: configured ad breaks and periodic jingles are selected from active, hidden local assets and inserted transactionally with the system requester and queue priority. Autoplay play statistics are updated when a recovered track starts.
- Enforced the selected queue visibility policy for HTTP and Socket.IO: an administrator role alone cannot read or join a device queue; the caller needs that device's user session or valid kiosk credential.
- Completed strict empty-query validation on jukebox writes, kiosk registration, and user profile reads. Spotify controller Express `Request` typing was corrected after the build exposed a DOM type collision.
- Regenerated `backend-refactor/docs/openapi.json`. Final checks: `npm run build`, `npm run lint`, `npm test -- --reporter=dot` (8 files, 25 tests), and `npx prisma validate` passed. Build/Prisma generation used only a placeholder local connection string and did not contact a database.
- The implementation refactor is complete for the requested non-game plan. Operational rollout remains separate: compare the legacy production schema with the Prisma model and prepare/review a safe baseline before any migration; validate Redis/secrets in staging; perform a staging contract run; and complete real Spotify authorization/playback checks when a device/account is available. The generated initial migration is from-empty and must not be deployed as-is over an existing database. No cutover or production restart was performed.

### Final architecture and plan acceptance audit (2026-09-26)

- Completed the remaining dependency inversion work found in the plan audit. Identity, jukebox, Spotify OAuth, avatar storage, and catalog job-ID generation now receive the shared `Clock`/`IdGenerator` ports through module wiring. Spotify OAuth and playback requests now go through `SpotifyOAuthHttpProvider` and `SpotifyOAuthHttpAdapter`; no feature service calls `fetch` directly.
- Ran the required negative layer test: temporarily added a Prisma import to `identity.service.ts`; ESLint reported the restricted Prisma imports and unused probe import. Restored the exact original file contents afterward. Normal `npm run lint` passes.
- Static architecture scan: no Prisma/Express imports from module services and no `infra` imports from controllers. `process.env` reads remain inside `core/config`; no `$queryRaw`, `$executeRaw`, `exec`, or `execSync` found in refactor source. `_template/` remains deliberately unmounted scaffolding; legacy route aliases remain intentionally mounted inside `/api/v1` and behind the same global/security middleware to retain current client compatibility.
- Final implementation checks after the architecture changes: `npm run build`, `npm run lint`, and `npm test -- --reporter=dot` passed (8 files, 25 tests). The layer violation probe was rejected as intended. No active database or production service was touched.
- Refactor implementation and requested documentation/inventory updates are complete. Existing database schema comparison/baseline, staging operation, and live Spotify account/device validation remain separate rollout verification; the empty-database initial migration must not be applied over production.
