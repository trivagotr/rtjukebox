# Yayin PC Agent Codex Promptu - Next Song Voting

Bu bilgisayar RadioTEDU yayin bilgisayari olacak. Ses yayinini bu bilgisayar yapacak; backend sadece mobil uygulama ile yayin PC'si arasindaki oylama koordinasyonunu saglayacak.

Mimari:
- Yayin PC'si backend'e agent olarak baglanir.
- Mobil uygulama backend'e baglanir, aktif turu okur ve oy verir.
- Backend oy durumunu saklar ve Socket.IO eventleriyle mobil/yayin PC tarafini gunceller.
- Ses dosyasini backend calmayacak. Kazanan sarkiyi yayin PC'si kendi lokal kutuphanesinden veya yayin yazilimindan calacak.

Onemli sinirlar:
- Jukebox queue sistemine dokunma.
- `/api/v1/jukebox/*` route'larini kullanma.
- Bu ozellik sadece `/api/v1/next-song-voting` namespace'ini kullanacak.
- Agent token yayin PC'sinde kalacak, mobil uygulamaya konulmayacak.
- Backend payload'ina lokal dosya yolu gonderme. `C:\...`, `/home/...`, `/var/...`, `file://...` gibi path'ler yasak. Sarkiyi eslestirmek icin `externalId` veya `songId` kullan.

Backend base URL:
```text
https://<rtjukebox-backend-domain>/api/v1/next-song-voting
```

Gizli token:
```env
NEXT_SONG_VOTING_AGENT_TOKEN=<backenddeki ayni token>
```

Tum agent isteklerinde header:
```text
Authorization: Bearer <NEXT_SONG_VOTING_AGENT_TOKEN>
Content-Type: application/json
```

1. Yeni oylama turu baslat

Endpoint:
```text
POST /api/v1/next-song-voting/agent/rounds
```

Body:
```json
{
  "action": "start",
  "prompt": "Sıradaki şarkı için oy ver",
  "deviceId": null,
  "agentId": "broadcast-pc-main",
  "expiresAt": "2026-07-01T21:30:00.000Z",
  "candidates": [
    {
      "externalId": "library-track-001",
      "title": "Song Title 1",
      "artist": "Artist 1",
      "artworkUrl": "https://example.com/artwork-1.jpg"
    },
    {
      "externalId": "library-track-002",
      "title": "Song Title 2",
      "artist": "Artist 2",
      "artworkUrl": "https://example.com/artwork-2.jpg"
    }
  ]
}
```

Notlar:
- En az 2 aday gonder.
- `externalId`, yayin PC'sindeki lokal muzik kutuphanesiyle eslestirme anahtari olmali.
- `expiresAt` opsiyonel ama onerilir.
- Lokal dosya yolunu `metadata`, `streamUrl`, `previewUrl` veya herhangi bir alanda gonderme.

2. Aktif turu guncelle

Endpoint:
```text
POST /api/v1/next-song-voting/agent/rounds
```

Body:
```json
{
  "action": "update",
  "roundId": "<round-id>",
  "prompt": "Son oylar alınıyor",
  "expiresAt": "2026-07-01T21:31:00.000Z"
}
```

3. Oylamayi kilitle

Mobil uygulamada oy butonlari kapanir, sonuc bekleniyor durumu gosterilir.

Body:
```json
{
  "action": "lock",
  "roundId": "<round-id>"
}
```

4. Kazanani otomatik sec ve turu sonuclandir

Backend en yuksek oy alan adayi secer. Beraberlikte aday sirasi kullanilir.

Body:
```json
{
  "action": "resolve",
  "roundId": "<round-id>"
}
```

Response icinden kazanan:
```text
data.round.winningCandidateId
```

Kazanan aday detayini `data.round.candidates[]` icinden `id === winningCandidateId` ile bul. Sonra `externalId` ile yayin PC'sindeki lokal sarkiyi eslestir ve yayin yaziliminda cal.

5. Belirli adayi kazanan olarak sonuclandir

Manuel override gerekirse:
```json
{
  "action": "resolve",
  "roundId": "<round-id>",
  "winningCandidateId": "<candidate-id>"
}
```

6. Turu iptal et

Body:
```json
{
  "action": "cancel",
  "roundId": "<round-id>"
}
```

Socket.IO:
- Yayin PC'si isterse backend Socket.IO'ya da baglanabilir.
- Dinlenecek eventler:
  - `next_vote_round_started`
  - `next_vote_round_updated`
  - `next_vote_round_locked`
  - `next_vote_round_resolved`
  - `next_vote_round_cancelled`
- `next_vote_round_updated` ile yayin PC panelinde anlik oy sayilarini gosterebilirsin.

Beklenen yayin PC akisi:
1. Siradaki 2-5 sarki adayini yayin PC'si belirler.
2. `action=start` ile backend'de tur acilir.
3. Mobil uygulamalar Socket.IO ile yeni turu gorur.
4. Sure bitince yayin PC'si `action=lock` gonderir.
5. Kisa bir beklemeden sonra `action=resolve` gonderir.
6. Backend kazanan adayi dondurur.
7. Yayin PC'si kazanan aday `externalId` ile lokal sarkiyi bulur ve yayina alir.
8. Bir sonraki tur icin ayni akis tekrar eder.

Kabul kriterleri:
- Agent token kod icinde hardcode edilmesin; env/config dosyasindan okunsun.
- Lokal dosya yolu backend'e gonderilmesin.
- Her request hata durumlarini loglasin ama token'i loglamasin.
- `start`, `lock`, `resolve`, `cancel` aksiyonlari manuel test edilsin.
- Mobil uygulama ile ayni anda testte Socket.IO eventleri gorulsun.
- Test sonunda kullanilan endpointleri ve response ozetlerini raporla.
