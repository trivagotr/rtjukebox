# Ranking And Guest Limits Design

**Goal:** Jukebox puanlamasını öngörülebilir hale getirmek, şarkı puanı ile kullanıcı rank puanını ayırmak ve guest kullanımını hesap açmaya teşvik edecek şekilde sınırlandırmak.

## Problem

Mevcut sistem birden fazla kuralı aynı anda uyguluyor:

- queue item sırası `priority_score` formülüyle hesaplanıyor
- kullanıcı `rank_score` alanı şarkı ekleme, oy alma, super oy kullanma ve şarkı çalınması gibi farklı olaylardan etkileniyor
- super vote eski sistemde `+4` / `+10` gibi özel sabitler kullanıyor
- guest limiti client-side `AsyncStorage` ile tutuluyor; yeni guest hesabı açarak aşılabiliyor

Bu yüzden kullanıcıya görünen puan ile backend’in tuttuğu puan aynı şeyi temsil etmiyor.

## Chosen Model

Sistem iki bağımsız puan eksenine ayrılacak:

### 1. Queue Item Song Score

Bu değer sadece sıradaki parçanın topluluk puanını temsil eder.

- queue item sıraya eklendiğinde `song_score = 0`
- upvote geldiğinde `song_score +1`
- downvote geldiğinde `song_score -1`
- supervote geldiğinde `song_score +3`

`queue_items.priority_score` alanı artık eski zaman/rank ağırlıklı formül olmayacak. Bu alan doğrudan şarkı puanını taşıyacak ve API ayrıca açık isimle `song_score` dönecek.

### 2. User Rank Score

Bu değer kullanıcının liderlik puanıdır.

- kullanıcı şarkı eklediğinde `+2`
- eklediği şarkı upvote aldığında `+1`
- eklediği şarkı downvote aldığında `-1`
- eklediği şarkı supervote aldığında `+2`

Ekstra gizli ödül/ceza olmayacak. Özellikle şu kurallar kaldırılacak:

- şarkı çalındığında otomatik `+10`
- supervote kullanan oylayana ekstra `+10`
- community skip ile ekstra `-10`
- kullanıcı rank puanını queue sıralamasına katan ağırlık

## Vote Semantics

Vote’lar backend’de semantik olarak tutulacak:

- `upvote`
- `downvote`
- `supervote`

Depolama tarafında mevcut `votes.vote_type` alanı korunabilir, ancak anlamı yeniden tanımlanacak:

- `1` = upvote
- `-1` = downvote
- `2` = supervote

Skor etkileri helper fonksiyonlarla türetilecek:

- `song delta`: `+1 / -1 / +3`
- `requester rank delta`: `+1 / -1 / +2`

Bu sayede toggle ve vote değiştirme durumlarında delta hesapları deterministik olur:

- `none -> upvote`: song `+1`, requester `+1`
- `upvote -> downvote`: song `-2`, requester `-2`
- `downvote -> supervote`: song `+4`, requester `+3`
- `supervote -> none`: song `-3`, requester `-2`

## Supervote Rule

Supervote sadece giriş yapmış kullanıcıya açık olacak.

- guest kullanıcı supervote kullanamaz
- giriş yapmış kullanıcı `Europe/Istanbul` gününde yalnızca `1` kez supervote kullanabilir
- mevcut `users.last_super_vote_at` alanı bu limit için kullanılabilir; karşılaştırma UTC değil İstanbul günü ile yapılmalı

## Guest Daily Song Limit

Guest kullanıcı tüm kiosklar toplamında günde yalnızca `1` şarkı ekleyebilir.

Bu limit guest user id’ye değil, kalıcı client fingerprint’e bağlanacak. Amaç yeni guest hesabı açarak limit aşılmasını engellemek.

Önerilen model:

- web: `localStorage` tabanlı kalıcı rastgele fingerprint
- mobile: `AsyncStorage` tabanlı kalıcı rastgele fingerprint
- backend: `X-Guest-Fingerprint` header veya eşdeğer request alanı
- fallback: fingerprint yoksa `ip + user-agent` ile kaba limit uygulanır

Yeni tablo:

- `guest_daily_song_limits`
  - `fingerprint`
  - `day_key` (`YYYY-MM-DD`, Europe/Istanbul)
  - `songs_added`
  - unique: `(fingerprint, day_key)`

Guest limit dolduğunda hata mesajı signup avantajını açıkça söylemeli.

## Leaderboards

Liderlik iki ayrı görünüm sunacak:

- `total`
- `monthly`

`users.rank_score` total skor olarak kalacak. Aylık skor ayrı tabloda tutulacak:

- `user_monthly_rank_scores`
  - `user_id`
  - `year_month` (`YYYY-MM`, Europe/Istanbul)
  - `score`
  - unique: `(user_id, year_month)`

Bu tablo her rank delta uygulandığında güncellenecek. Böylece aylık sıralama reset job’ı gerektirmez.

## API Contract Changes

### Queue response

Queue item payload’ına açık skor alanı eklenecek:

- `song_score`
- `user_vote`
- gerekiyorsa `vote_kind`

UI artık `(upvotes - downvotes)` yerine `song_score` gösterecek.

### Vote endpoint

Vote endpoint kuralı:

- standard vote: `vote = 1 | -1`
- supervote: `is_super = true`

Backend, stored vote türüne göre delta hesaplayacak ve hem queue item hem requester rank hem monthly rank güncelleyecek.

### Leaderboard endpoint

`GET /users/leaderboard?period=total|monthly`

Default `total` olabilir. Mobile ve web iki görünümü de kullanacak.

### User stats endpoint

`/users/:id/stats` ve `/auth/me` yanıtlarına şu alanlar eklenmeli:

- `rank_score` (total)
- `monthly_rank_score`
- `supervote_remaining_today`

## UI / Product Changes

### Web

- guest kullanıcıda supervote butonu gizli veya disabled
- guest günlük limit dolduğunda queue add hata mesajı “hesap açarsan sınırsız ekleyebilirsin” yönünde olmalı
- leaderboard modal `Total / Aylik` toggle göstermeli
- queue item puan rozeti `song_score` göstermeli

### Mobile

- aynı supervote kuralı mobile jukebox ekranında da çalışmalı
- guest limit `AsyncStorage`’daki eski `guest_request_used` client-only kuralından çıkarılmalı
- leaderboard ekranı `Total / Aylik` toggle ile iki veri seti gösterebilmeli

## Testing Strategy

Önemli regression alanları:

- şarkı ekleme `guest vs member`
- guest limit İstanbul gününe göre
- supervote günlük `1`
- vote delta geçişleri (`up -> down`, `down -> super`, `super -> none`)
- requester total rank ve monthly rank birlikte güncelleniyor mu
- queue item `song_score` doğru mu
- web/mobile UI doğru alanı gösteriyor mu

## Notes

Bu değişiklikte amaç “daha akıllı ranking” değil, şeffaf ve sabit kural seti. Zaman ağırlığı, requester rank etkisi ve playback sonrası bonus gibi örtük davranışlar çıkarılmalı.
