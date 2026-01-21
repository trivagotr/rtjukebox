# RadioTEDU - Jukebox Algorithm & Realtime

## Priority Score Algoritması

Şarkıların sıralamada konumunu belirleyen formül:

```
priority_score = (queue_time_weight * T) + (vote_weight * V) + (user_rank_weight * R)

Nerede:
- T = Bekleme süresi faktörü (0-100): max(0, 100 - dakika_bekleme * 2)
- V = Net oy skoru: (upvotes - downvotes) * 10
- R = Kullanıcı rank bonusu: user_rank_score / 100 (max 50 puan)
```

### Ağırlıklar (Configurable)
| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| queue_time_weight | 1.0 | Erken ekleyenler önce çalsın |
| vote_weight | 1.5 | Oylar etkili olsun |
| user_rank_weight | 0.5 | Rank avantajı çok baskın olmasın |

### Örnek Hesaplama
```
Şarkı A: 5 dk bekliyor, +8 oy, kullanıcı rank=200
T = 100 - 10 = 90
V = 8 * 10 = 80
R = 200 / 100 = 2 (capped at 50) = 2
Score = (1.0 * 90) + (1.5 * 80) + (0.5 * 2) = 90 + 120 + 1 = 211

Şarkı B: 2 dk bekliyor, +15 oy, kullanıcı rank=50
T = 100 - 4 = 96
V = 15 * 10 = 150
R = 50 / 100 = 0.5
Score = 96 + 225 + 0.25 = 321.25 → Şarkı B önde
```

---

## Auto-Skip Mekanizması

```
IF (downvotes >= SKIP_THRESHOLD) AND (downvotes > upvotes * 2):
    skip_song()
    add_cooldown(song_id, 30 minutes)
    penalize_user(added_by, -10 rank points)
```

### Parametreler
| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| SKIP_THRESHOLD | 5 | Minimum downvote sayısı |
| COOLDOWN_MINUTES | 30 | Aynı şarkı tekrar eklenemez |
| PENALTY_POINTS | -10 | Eklenen kullanıcıya ceza |

---

## Abuse Prevention

### Rate Limiting
| Aksiyon | Limit | Süre |
|---------|-------|------|
| Şarkı ekleme | 3 | 15 dakika |
| Oylama | 20 | 5 dakika |
| API genel | 100 | 1 dakika |

### Duplicate Vote Prevention
```sql
-- Unique constraint ile
UNIQUE(queue_item_id, user_id)
```

### Device Fingerprinting
- Mobil: Device ID + App instance ID
- Her cihazdan max 2 hesap

---

## WebSocket Flow

```
┌─────────┐          ┌──────────┐          ┌─────────┐
│ Mobile  │          │  Server  │          │  Kiosk  │
└────┬────┘          └────┬─────┘          └────┬────┘
     │                    │                     │
     │ connect + auth     │                     │
     │───────────────────>│                     │
     │                    │                     │
     │ join_device(id)    │                     │
     │───────────────────>│                     │
     │                    │                     │
     │  queue_updated     │  queue_updated      │
     │<───────────────────│────────────────────>│
     │                    │                     │
     │ add_song           │                     │
     │───────────────────>│                     │
     │                    │ recalculate queue   │
     │                    │─────────┐           │
     │                    │<────────┘           │
     │                    │                     │
     │  queue_updated     │  queue_updated      │
     │<───────────────────│────────────────────>│
     │                    │                     │
     │                    │  now_playing        │
     │<───────────────────│────────────────────>│
```

### Socket.IO Rooms
- `device:{device_id}` - Aynı kiosk'a bağlı herkes
- `user:{user_id}` - Kişisel bildirimler

---

## Kiosk App Önerisi

**Ayrı uygulama öneriyorum:**
- Daha basit, tek amaçlı
- Kiosk mode (Android Launcher)
- Auto-start on boot
- Heartbeat ile sunucuya durum bildirimi
- Sadece çalma + queue gösterimi

**Temel Akış:**
1. Kiosk boot → sunucuya bağlan
2. Queue'dan sıradaki şarkıyı çek
3. Şarkıyı çal
4. Bitince sonraki şarkıya geç
5. Queue boşsa varsayılan playlist
