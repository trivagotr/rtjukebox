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