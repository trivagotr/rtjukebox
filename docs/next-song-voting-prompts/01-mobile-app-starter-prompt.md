# Mobil Uygulama Codex Promptu - Next Song Voting Entegrasyonu

Bu mobil uygulamada RadioTEDU Jukebox queue sisteminden ayrı çalışan "sıradaki şarkı oylaması" özelliğini backend'e bağla.

Önemli sınırlar:
- Jukebox queue sistemine dokunma.
- `/api/v1/jukebox/*`, `/jukebox/*` veya mevcut queue vote route'larını kullanma.
- Yeni özellik sadece şu namespace'i kullanmalı: `/api/v1/next-song-voting`.
- Agent token mobil uygulamaya konulmayacak. Mobil uygulama yalnızca aktif turu okur, oy gönderir ve socket eventlerini dinler.

Backend contract:
- `GET /api/v1/next-song-voting/rounds/active`
- `POST /api/v1/next-song-voting/rounds/:roundId/votes`
- Socket.IO eventleri:
  - `next_vote_round_started`
  - `next_vote_round_updated`
  - `next_vote_round_locked`
  - `next_vote_round_resolved`
  - `next_vote_round_cancelled`

Base URL:
- Mevcut uygulamadaki API base URL neyse onu kullan.
- Örnek: `https://<backend-domain>/api/v1/next-song-voting`

Kimlik / clientId:
- Kullanıcı login olmuşsa mevcut JWT token ile `Authorization: Bearer <token>` gönder.
- Kullanıcı login değilse de oy kullanabilmesi için uygulama cihaz bazlı kalıcı bir `clientId` üretmeli.
- `clientId` uygulama silinmediği sürece sabit kalmalı; secure/local storage içinde sakla.
- Tüm next-song-voting isteklerinde `x-client-id: <clientId>` header'ı gönder.
- Vote body içinde de `clientId` gönderebilirsin.

Aktif turu çekme:
- Endpoint: `GET /api/v1/next-song-voting/rounds/active`
- Header:
  - `Authorization: Bearer <token>` opsiyonel
  - `x-client-id: <clientId>` zorunlu gibi düşün
- İsteğe bağlı query:
  - `deviceId=<uuid>` eğer uygulamada belirli kiosk/device bağlamı varsa
- Başarılı response genel formatı:
```json
{
  "success": true,
  "data": {
    "id": "round uuid",
    "deviceId": "device uuid veya null",
    "status": "active",
    "prompt": "Sıradaki şarkı için oy ver",
    "expiresAt": "date veya null",
    "winningCandidateId": null,
    "voteCount": 12,
    "userVoteCandidateId": "candidate uuid veya null",
    "candidates": [
      {
        "id": "candidate uuid",
        "externalId": "opsiyonel",
        "songId": "opsiyonel",
        "title": "Song title",
        "artist": "Artist",
        "album": null,
        "durationSeconds": 180,
        "artworkUrl": "https://... veya /api/uploads/...",
        "previewUrl": null,
        "streamUrl": null,
        "voteScore": 5,
        "voteCount": 5,
        "position": 1,
        "metadata": {}
      }
    ]
  }
}
```
- `data: null` dönerse aktif oylama yok UI göster.

Oy gönderme:
- Endpoint: `POST /api/v1/next-song-voting/rounds/:roundId/votes`
- Header:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>` opsiyonel
  - `x-client-id: <clientId>`
- Body:
```json
{
  "candidateId": "candidate uuid",
  "clientId": "kalici-client-id"
}
```
- Başarılı response:
```json
{
  "success": true,
  "data": {
    "round": { "...": "guncel round payload" },
    "reward": {
      "points": 1,
      "idempotent": false
    }
  }
}
```
- Oy değiştirilebilmeli: kullanıcı başka adaya basarsa aynı round içinde oy yeni adaya taşınır.
- Aynı adaya tekrar basınca ekstra ödül bekleme; backend idempotent çalışıyor.

Socket.IO:
- Mevcut Socket.IO bağlantısını kullan.
- Eğer app device/kiosk bağlamı kullanıyorsa bağlantıdan sonra mevcut sistemdeki gibi `join_device` ile device room'a katıl.
- Aşağıdaki eventleri dinle ve UI state'ini güncelle:
  - `next_vote_round_started`: yeni turu göster.
  - `next_vote_round_updated`: aday oy sayılarını ve kullanıcının seçimini güncelle.
  - `next_vote_round_locked`: oy butonlarını kilitle, sonuç bekleniyor göster.
  - `next_vote_round_resolved`: kazananı göster.
  - `next_vote_round_cancelled`: turu kapat veya iptal mesajı göster.

UI davranışı:
- Ana ekranda veya uygun yerde "Sıradaki Şarkıya Oy Ver" alanı ekle.
- Aktif round yoksa sessiz/temiz bir boş durum göster.
- Aday kartlarında title, artist, artwork, voteCount göster.
- Kullanıcının seçtiği adayı `userVoteCandidateId` ile işaretle.
- `status !== active` olduğunda oy verme butonlarını disable et.
- `expiresAt` varsa kalan süre gösterilebilir.
- Network hatasında mevcut UI'ı bozma; tekrar dene butonu koy.

Kabul kriterleri:
- Mobil uygulama hiçbir yerde `/api/v1/jukebox/voting`, `/api/v1/jukebox/vote` veya queue vote route'u kullanmamalı.
- Aktif tur çekiliyor.
- Oy gönderiliyor ve response'taki güncel round ile UI yenileniyor.
- Socket eventleri geldiğinde UI otomatik güncelleniyor.
- Agent token mobil build içine girmiyor.
- Build/test/lint çalıştır ve geçen komutları raporla.
