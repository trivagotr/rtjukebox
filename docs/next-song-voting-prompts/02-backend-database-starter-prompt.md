# Backend/Database Bilgisayarı Codex Promptu - Next Song Voting Kurulum Kontrolü

Bu bilgisayarda RadioTEDU canlı sitesi, WordPress ve kiosk dosyalarına dokunma. Sadece RTJukebox backend ve PostgreSQL tarafında "next song voting" için gerekli kurulum kontrolünü yap.

Önemli sınırlar:
- `radiotedu.com`, WordPress, ana site dosyaları ve kiosk frontend dosyalarına müdahale etme.
- Jukebox queue route'larını değiştirme.
- Yeni özellik sadece `/api/v1/next-song-voting` namespace'inde çalışmalı.
- İşlemden önce dosya ve veritabanı yedeği al.
- Hangi DB'ye bağlandığını doğrulamadan migration çalıştırma.

Repo/backend konumu:
- RTJukebox backend klasörünü bul.
- Beklenen örnek konum: `C:\Users\tuna.ozsari\Desktop\rtjukebox\rtjukebox\backend`
- Bu klasörde şu dosyaların varlığını kontrol et:
  - `src/routes/nextSongVoting.ts`
  - `src/db/schema.sql`
  - `src/db/migrate.ts`
  - `src/server.ts`

Beklenen backend contract:
- `GET /api/v1/next-song-voting/rounds/active`
- `POST /api/v1/next-song-voting/rounds/:roundId/votes`
- `POST /api/v1/next-song-voting/agent/rounds`
- Socket.IO eventleri:
  - `next_vote_round_started`
  - `next_vote_round_updated`
  - `next_vote_round_locked`
  - `next_vote_round_resolved`
  - `next_vote_round_cancelled`

Environment ayarları:
- `.env` içinde `DATABASE_URL` doğru PostgreSQL veritabanına bakmalı.
- `.env` içine güçlü bir agent token ekle:
```env
NEXT_SONG_VOTING_AGENT_TOKEN=buraya_uzun_rastgele_gizli_token
```
- Bu token mobil uygulamaya verilmez.
- Bu token sadece yayın bilgisayarı/local voting agent tarafında kullanılır.

Yedek:
- Backend klasöründe `.codex-backups` altında zaman damgalı yedek klasörü oluştur.
- En az şu dosyaları yedekle:
  - `src/server.ts`
  - `src/db/schema.sql`
  - `src/db/migrate.ts`
  - `.env` varsa `.env` yedeğini gizli kalacak şekilde aynı makinede sakla.
- Veritabanı için mümkünse `pg_dump` veya sunucu snapshot yedeği al.
- DB yedeği alamıyorsan migration çalıştırmadan önce dur ve kullanıcıya bunu açıkça söyle.

Build kontrolü:
```powershell
cd "C:\Users\tuna.ozsari\Desktop\rtjukebox\rtjukebox\backend"
npm run build
```
- Build hatası varsa migration veya restart yapma; önce hatayı düzelt.

Migration:
- Hangi DB'ye bağlanıldığını doğrula.
- Sonra migration çalıştır:
```powershell
cd "C:\Users\tuna.ozsari\Desktop\rtjukebox\rtjukebox\backend"
node dist/db/migrate.js
```
- Eğer `dist` yoksa önce `npm run build` çalıştır.
- Alternatif olarak dev dependency'ler kuruluysa:
```powershell
npx tsx src/db/migrate.ts
```

Migration sonrası DB'de şu tabloları doğrula:
- `next_song_vote_rounds`
- `next_song_vote_candidates`
- `next_song_votes`
- `next_song_vote_rewards`

Doğrulama için Node/psql ile şu kontrol yapılabilir:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'next_song_%'
ORDER BY table_name;
```

Backend restart:
- Sadece RTJukebox backend servisini restart et.
- WordPress, IIS site binding, radiotedu.com ana site veya kiosk dosyalarına dokunma.
- Servis PM2, Windows Service, IISNode veya başka bir yöntemle çalışıyorsa önce mevcut yöntemi tespit et; aynı yöntemle sadece backend'i restart et.

Smoke test:
- Agent token ile yeni round başlatmayı test et. Curl kullanmak zorunda değilsin; PowerShell veya Node fetch kullan.
- Örnek agent start body:
```json
{
  "action": "start",
  "prompt": "Sıradaki şarkı için oy ver",
  "candidates": [
    {
      "externalId": "demo-1",
      "title": "Demo Song 1",
      "artist": "Demo Artist 1",
      "artworkUrl": "https://example.com/artwork-1.jpg"
    },
    {
      "externalId": "demo-2",
      "title": "Demo Song 2",
      "artist": "Demo Artist 2",
      "artworkUrl": "https://example.com/artwork-2.jpg"
    }
  ]
}
```
- Header:
  - `Authorization: Bearer <NEXT_SONG_VOTING_AGENT_TOKEN>`
  - `Content-Type: application/json`

Oy test body:
```json
{
  "candidateId": "start response icindeki candidate id",
  "clientId": "server-smoke-test-client-001"
}
```

Kontrol edilmesi gerekenler:
- `GET /api/v1/next-song-voting/rounds/active` aktif round döndürüyor.
- Vote endpoint 200 dönüyor ve aynı client için tekrar reward çoğaltmıyor.
- Agent `lock`, `resolve`, `cancel` action'ları 500 vermiyor.
- Response payload içinde Windows/Linux local path dönmüyor.
- Socket.IO eventleri backend loglarında veya client testinde görülebiliyor.

Rapor formatı:
- Hangi klasörde çalıştığını yaz.
- Yedek klasörünü yaz.
- DB yedeğinin alındığını yaz.
- Çalışan komutları ve sonuçlarını yaz.
- Migration sonucu oluşan tabloları yaz.
- Restart edilen servis adını yaz.
- Hata varsa hiçbir şeyi gizleme; migration veya restart yapılmadıysa açıkça belirt.
