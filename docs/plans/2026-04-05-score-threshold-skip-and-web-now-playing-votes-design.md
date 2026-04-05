# Score Threshold Skip And Web Now-Playing Votes Design

**Goal:** Jukebox oy davranisini song score uzerinden tek kurala indirmek ve web now-playing yuzeyine mobildeki gibi oy verme eklemek.

## Summary

Mevcut backend skip karari `downvotes >= 3 && downvotes > upvotes + 1` kuraliyla veriliyor. Bu kural kullaniciya gorunen `song_score` ile birebir eslesmiyor. Ayrica web/Vite tarafinda oy kontrolleri kuyruktaki pending itemlarda var, fakat now-playing hero ayni akisa tam olarak bagli degil.

Yeni model:

- Hem `pending` hem `playing` queue item icin skip karari `song_score <= -5` olunca verilecek.
- `song_score`, mevcut oy modelinden tureyecek:
  - upvote `+1`
  - downvote `-1`
  - supervote `+3`
- Web now-playing hero da ayni vote endpointini kullanarak upvote/downvote/supervote alabilecek.

## Backend Behavior

- Vote endpoint tek kaynak olmaya devam edecek.
- Queue item icin yeni `song_score` hesaplandiktan sonra skip esigi kontrol edilecek.
- `song_score <= -5` ise:
  - item `status='skipped'`
  - item `playing` ise `devices.current_song_id` temizlenecek
  - `song_skipped` ve `queue_updated` emit edilecek
- `pending` item skip ise kuyruktan dusecek ve `queue_updated` emit edilecek.

Bu sayede kullanici arayuzunde gordugu skor ile backendin uyguladigi skip davranisi ayni mantiga oturacak.

## Web Behavior

- Now-playing hero icinde oy kontrolleri gosterilecek.
- Pending queue item ile ayni `handleVote` akisi kullanilacak.
- Now-playing tarafinda da `song_score` ve `user_vote` aktif gorunecek.
- Guest kullanicida supervote gizli kalacak; uye kullanicida gunluk supervote limiti mevcut mantikla korunacak.

## Testing

- Backend route testi:
  - `song_score = -5` oldugunda pending item skip oluyor
  - `song_score = -5` oldugunda playing item skip olup `current_song_id` temizleniyor
- Web helper/UI testi:
  - now-playing item icin vote state dogru hesaplanabiliyor
  - now-playing controls mevcut `handleVote` ile baglaniyor
