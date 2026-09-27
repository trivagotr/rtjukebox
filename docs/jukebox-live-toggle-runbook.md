# Jukebox canli erisim kapatma ve geri acma runbook'u

Guncelleme: 2026-09-25

## Mevcut durum

Salt okunur canli kontrollerinde `https://radiotedu.com/jukebox/`, `/jukebox/kiosk/` ve `/jukebox/api/v1/jukebox/songs?page=1` HTTP 200 dondu. `/jukebox/health` 200; `/jukebox/health/live` 404. API CORS preflight 204 donuyor ancak `PATCH`, `Access-Control-Allow-Credentials`, `x-auth-transport` ve `x-kiosk-credential` izinleri cevapta yok. Dolayisiyla site/kiosk/API erisilebilir olsa da guncel controller auth/CORS akisi canlida dogrulanmis degil.

Windows makinesinde IIS (`W3SVC`, `WAS`) calisiyor. Port 3000 `node.exe` surecinin parent'i otomatik baslayan `RadioTEDU-Jukebox` Windows servisidir (LocalSystem). WinSW tanimi `C:/RadioTEDU/runtime/jukebox-service/RadioTEDU-Jukebox.xml`; Node komutu `C:/Program Files/nodejs/node.exe dist/server.js`, calisma dizini bu repo icindeki `backend/`, log dizini `C:/ProgramData/RadioTEDU/jukebox/logs`, stop timeout 20 saniyedir. IIS kural dosyasi `C:/inetpub/wwwroot/web.config`; health proxy onceki kopyasi `C:/inetpub/wwwroot/web.config.pre_live_health_20260925-201310.bak`.

## Tam erisim kesintisi yapilmadan once

1. Uygulama sahibinden planli bakim zamani ve hedef durum (bakim sayfasi mi, tamamen 503 mu) alinir; canli kullanicilara bildirim gerekiyorsa gonderilir.
2. `web.config`'in yeni tarihli yedegi alinir. Yedek parse edilip geri yazilabilirligi kontrol edilir.
3. Servis yoneticisi ve komut artik tespit edilmistir. Kod degistirilecekse once geri alinabilir build hazirlanir; servis yonetimi yalniz RadioTEDU-Jukebox Windows servisi uzerinden yapilir. PID'yi elle sonlandirma veya tum IIS'i yeniden baslatma kullanilmaz.
4. Is kuyrugu ve aktif playback durumu kontrol edilir. Su anki Redis 3.0.504, BullMQ icin desteklenmiyor; eski surecin kuyruk davranisi guvenli kapatma oncesi ayrica teyit edilmelidir.

## Jukebox'u gecici olarak disariya kapatma

1. Yalnizca `^jukebox(?:/.*)?$` yolunu eslestiren bakim kuralini, `web.config` icinde Jukebox proxy ve bypass kurallarindan once ekle. Kural yalniz `/jukebox` altini bakim yanitina yonlendirmeli; diger RadioTEDU yollarini etkilememelidir.
2. IIS kural degisikliginden sonra `/jukebox/`, `/jukebox/kiosk/`, `/jukebox/api/v1/...` ve `/jukebox/socket.io` disaridan bakim yaniti vermeli. `/`, radyo API'leri ve diger siteler normal yanit vermeye devam etmeli.
3. Uygulama tam kapatilacaksa, once servis yoneticisinde bulunan Jukebox Node servisini kontrollu durdur. `W3SVC` veya tum IIS'i durdurma.
4. Islemden sonra loglari ve port 3000 dinleyicisini kontrol et. Geri donus icin yedeklenen config ve ayni servis tanimi hazir tutulur.

## Geri acma

1. Bakim kuralini kaldir ya da kaydedilen saglam `web.config` yedegini geri yukle; tum dosyayi eski kopyayla ezmeden once o aradaki diger site degisikliklerini karsilastir.
2. Node uygulamasi durdurulduysa, yalniz tespit edilen servis yoneticisinin kayitli komutuyla baslat. PID'yi elle olusturmak yerine servisin kendi calistirma dizini ve environment ayarlarini kullan.
3. Sirayla yerel `/health`, public `/jukebox/health`, public UI, kiosk ve song catalog API'yi kontrol et. Ardindan `/health/live`, token korumali readiness, CORS preflight (`PATCH`, credentials ve gereken custom header'lar), giris/cerez ve authenticated Socket.IO'yu dogrula.
4. BullMQ icin Redis 5+ uyumlu servis saglanmadan release readiness'in yesile donmesi beklenmemeli. Spotify playback gerekiyorsa admin ve kiosk/device OAuth grant'lerini de kontrol et.
5. Ancak tum kontroller basarili oldugunda bakim sayfasini kaldir ve acilisi tamamlandi olarak kaydet.

## Bu incelemede yapilmayanlar

Canli Jukebox kapatilmadi veya yeniden baslatilmadi; `web.config`'e yeni bakim kural eklenmedi. Uygulama disaridan erisilebilir. Temiz HEAD `928ece2d` rollback build'i `C:/RadioTEDU/backups/20260925-jukebox-baseline-r928ece2d/dist` konumuna kopyalandi ve SHA-256 manifest olusturuldu; bu canlida calisan eski binary'nin birebir kopyasi degildir. Redis 5+ saglanmadan restart onerilmiyor. Restart kisa bir API/kiosk kesintisi yapar; public CORS ve health fix'lerini etkinlestirmek icin gereklidir.

## Rollback artifact

The `C:/inetpub/wwwroot/jukebox_backup_20260919_205915` folder contains static UI assets only; it does not include the active backend build. No exact snapshot of the old in-memory Node build was found. A clean TypeScript backend baseline from Git commit `928ece2d` was compiled in an isolated directory and copied, without activation, to `C:/RadioTEDU/backups/20260925-jukebox-baseline-r928ece2d/dist`. `ROLLBACK-MANIFEST.txt` records its SHA-256. This is a known source baseline, not a byte-for-byte copy of the old running binary.

Next action: provision Redis 5+ and configure the backend's `REDIS_URL`. Once readiness can pass against that service, use the prepared baseline, deploy build, restart only `RadioTEDU-Jukebox`, then verify public health, CORS, controller auth, kiosk and socket behavior.

## Windows sunucuda Redis 5+ hazirlama (Jukebox'u durdurmadan)

BullMQ 5.0+ Redis ister; BullMQ dokumani 6.2+ onerir. Bu host Windows'tur ve Redis'in resmi Windows kurulum yolu Docker'dir. Native Windows service isteniyorsa Memurai Redis API uyumlu secenektir. Memurai kurulum MSI'si yonetici izni gerektirir; Windows service olarak kurulabilir, port secilebilir ve varsayilan olarak loopback'e baglanir. Memurai'nin Developer Edition'i yalniz gelistirme/test icindir ve production kullanimi yasaktir; canli servis icin production lisansli Enterprise kullanilmali.

Bu hostta eski Redis 3, `localhost:6379` portunu kullaniyor. Mevcut servisi kaldirmadan yan yana kurulum:

1. Yonetici yetkili kullanici [Memurai indirme sayfasindan](https://www.memurai.com/get-memurai) production lisansli stable Enterprise MSI'sini indirip kurar. RC/preview veya Developer Edition secilmez.
2. Kurulumda Windows service secilir, yeni instance portu `6380` yapilir ve dis firewall exception acilmaz. Kurulum dokumani service ve port ayarlarini destekliyor; varsayilan kurulum loopback kullanir.
3. Servis baslayinca yonetici PowerShell'de su iki salt-okunur komutla kontrol eder:

   ```powershell
   & 'C:\Program Files\Memurai\memurai-cli.exe' -p 6380 ping
   & 'C:\Program Files\Memurai\memurai-cli.exe' -p 6380 info server
   ```

   Ilk komut `PONG` vermeli; ikinci komutta Redis API/version bilgisi gorunmeli. Kurulum baska dizine yapildiysa CLI yolunu ona gore degistirin.
4. `backend/.env` dosyasindaki mevcut tek `REDIS_URL=` satirini `REDIS_URL=redis://127.0.0.1:6380` yapin. Eski Redis servisi bu test sirasinda `6379`'da kalir. Parola veya lisans dosyasini sohbete gondermeyin.
5. Jukebox servisini henuz yeniden baslatmayin. Yalnizca `PONG` ve `INFO server` icindeki version satirini paylasin veya "hazir" deyin; ardindan ben uygulamanin ayni URL'ye baglandigini ve readiness'i canli servise dokunmadan dogrulayacagim. Onayli geciste uygulama servisi kademeli olarak 6380'e alinir; basarili dogrulamadan sonra eski Redis'i kapatma/port 6379'u yeniden kullanma karari ayrica verilir.

Memurai resmî kurulum/lisans bilgisi: [Windows install](https://docs.memurai.com/), [lisans](https://docs.memurai.com/en/config-license), [edition/karsilastirma](https://www.memurai.com/get-memurai). BullMQ version kosulu: [RedisConnection 6.3.8 docs](https://docs.bullmq.io/api/classes/v5.RedisConnection.html). Redis'in Windows kurulum siniri: [Redis install docs](https://redis.io/docs/latest/operate/oss_and_stack/install/).

### Redis installation and connection preflight completed (2026-09-25)

- Memurai is installed as an automatic Windows service and is Running. CLI `PING` returned `PONG`; `INFO server` reported Redis API `8.2.10`.
- The ignored `backend/.env` now has `REDIS_URL=redis://127.0.0.1:6380`. The node-redis client connected using that exact file and read `redis_version:8.2.10`; a BullMQ Queue connected and reached ready without creating a Worker or processing jobs.
- The legacy Redis service on port 6379 and `RadioTEDU-Jukebox` remain Running. The running Node process has not reloaded `.env`; live traffic still uses its pre-restart environment. Local `/health` still returns 200.
- Next: after approval for the brief API/kiosk interruption, restart only `RadioTEDU-Jukebox`, then verify `/health/live`, protected readiness, CORS, cookie login, kiosk, catalog, and Socket.IO. Keep port 6379 available until all checks pass.

### Restart permission result

The automated restart request was denied by Windows service permissions before the process stopped. The service stayed Running and local health remained 200. To activate the new `.env` target and current backend build, an administrator must run `Restart-Service -Name 'RadioTEDU-Jukebox'` in elevated PowerShell. Do not stop IIS or the legacy Redis 6379 service. Afterward, verify health, readiness, CORS, cookie login, kiosk, catalog and Socket.IO.

### Restart result and smoke checks (2026-09-25)

The user ran `Restart-Service -Name 'RadioTEDU-Jukebox'`. WinSW logged `The handle is invalid` while handling the Node process stop; Windows Service Control Manager then ran the configured recovery action and started the service again. The service is Running, local `/health` is 200, and IIS remained online. Do not retry a restart solely because PowerShell printed `StopServiceFailed`.

After recovery, the Node startup log reported `rate_limit_redis_ready` and `background_jobs_ready`. Memurai at port 6380 responds `PONG`. Local IIS checks passed: controller root, kiosk root, `/jukebox/health`, `/jukebox/health/live`, and token-authenticated `/jukebox/health/ready` returned 200. Login CORS OPTIONS returned 204 with credentials, PATCH, `x-auth-transport`, and `x-kiosk-credential` allowed. The readiness route deliberately returns 404 without its bearer token.

Remaining release checks: sign in through the controller in a browser and verify HttpOnly cookie behavior; establish authenticated Socket.IO; test from the intended public hostname; perform the separately approved staging/production schema and auth smoke; complete the required Spotify admin and kiosk/device authorization grants. Keep the old Redis service on port 6379 available until remaining release checks pass.

### Socket.IO proxy correction (2026-09-25)

The controller connect API succeeded, but Socket.IO polling through IIS returned 404. The configured backend/client path is `/jukebox/socket.io`; machine-level IIS had stripped `/jukebox` and forwarded to `/socket.io`. Updated only the action for `JUKEBOX_SUBDIR_SOCKET_PROXY` to preserve the prefix. The original `C:/inetpub/wwwroot/web.config` is backed up at `C:/inetpub/wwwroot/web.config.pre_live_jukebox_socket_20260925.bak`. Local IIS polling now returns 200 and the service stayed Running.

An authenticated local IIS socket smoke then used a short-lived in-memory token for an existing `KOLEJ` session. It connected and joined the device room; backend logs recorded `socket_connected` and `socket_joined_device`. This made no persistent data changes. The user reconnected the controller; confirm its queue/device state in the UI.

### Kiosk schema finding (2026-09-25)

A read-only check of the active `radiotedu` database found `devices` but no `kiosk_provisioning_codes` or `kiosk_credentials`. The current kiosk provisioning/auth routes depend on these tables. Prepared the additive migration at `backend/src/db/migrations/20260925_kiosk_credentials.sql`; it has not been applied. Next, take and validate a full backup of the confirmed active target before applying this scoped migration, then verify kiosk registration and credentialed playback-state. No database changes have been made during this check.

### Kiosk migration applied (2026-09-25)

Located PostgreSQL 18.1 tools at `C:/PostgreSQL/bin`. Created and validated full custom-format backup `C:/RadioTEDU/backups/20260925-radiotedu-pre-kiosk-migration.dump` (13,618,236 bytes; SHA-256 `783D21264D2767D8C9330E567BD093B2B80F84B51E73343E3E785124366D7D59`). Applied only `backend/src/db/migrations/20260925_kiosk_credentials.sql` to active `radiotedu`; both tables now exist. No service restart was needed and health remained 200.

`KOLEJ` is active but has zero valid kiosk credentials and no Spotify player target. The remaining operational steps require an admin session: generate a one-time kiosk provisioning code, register the physical kiosk at `/jukebox/kiosk/`, complete Spotify device authorization, then test playback. No admin credentials were accessed and no kiosk credential or Spotify grant was generated here.
