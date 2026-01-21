# RadioTEDU - Mobile App Screen Flows

## Tab Bar Yapısı
```
┌─────────────────────────────────────────┐
│              [Screen Content]            │
├────────┬────────┬────────┬────────┬─────┤
│  Home  │  Live  │Podcast │Jukebox │Profile│
└────────┴────────┴────────┴────────┴─────┘
```

---

## 1. Home Screen

### UI Bileşenleri
- Live status banner (canlı yayın varsa)
- Son 5 podcast horizontal scroll
- Jukebox quick join butonu
- Duyurular listesi

### Analytics Events
- `home_viewed`
- `live_banner_tapped`
- `podcast_card_tapped`
- `jukebox_quick_join_tapped`

### Hata Durumları
- Network yok → Offline banner + cached data
- API hata → Retry butonu

---

## 2. Live Radio Screen

### UI Bileşenleri
- Büyük play/pause butonu
- Album art / station logo
- Current show info (varsa)
- Volume slider
- Share butonu

### Akış
1. Ekran açılır → stream URL config'den çekilir
2. Play'e basılır → stream başlar
3. Background'a geçiş → audio devam eder
4. Lock screen controls aktif

### Hata Durumları
- Stream açılmıyor → "Yayın şu an kapalı" mesajı
- Connection lost → Auto-retry 3x, sonra manual retry

### Analytics
- `radio_play_started`
- `radio_play_stopped`
- `radio_error` + error type

---

## 3. Podcast Screen

### Liste Ekranı
- WordPress'ten kategorili postlar
- Pull-to-refresh
- Infinite scroll pagination
- Featured image + title + date

### Detay Ekranı
- Cover image (featured)
- Title + excerpt
- "Dinle" butonu (audio_url varsa)
- "Spotify'da Aç" butonu (her zaman)

### Player (Mini + Full)
- Mini player: altta sabit bar
- Full player: swipe up ile
- Progress bar, skip 15s, playback speed

### Akış
```
Liste → Tap item → Detay
                    ├→ audio_url var → Play in-app
                    └→ "Spotify'da Aç" → Deep link
```

### Analytics
- `podcast_list_viewed`
- `podcast_detail_viewed` + podcast_id
- `podcast_play_started` + podcast_id
- `spotify_opened` + podcast_id

---

## 4. Jukebox Screen

### Join Akışı
```
Jukebox Tab → QR Scanner → Scan → Device bağlantısı → Queue ekranı
```

### Queue Ekranı
- Now playing card (büyük)
- Sıradakiler listesi (scroll)
- Her item: cover, title, artist, votes, requester
- Upvote/downvote butonları
- "Şarkı Ekle" FAB

### Şarkı Ekleme
- Search bar
- Şarkı listesi
- Tap → Confirm → Queue'ya eklendi

### Realtime Updates
- Socket.IO ile queue değişiklikleri
- Vote animasyonları
- Position değişim animasyonu

### Analytics
- `jukebox_scan_started`
- `jukebox_connected` + device_id
- `song_added` + song_id
- `vote_cast` + vote_type

### Hata Durumları
- QR geçersiz → "Geçersiz kod" alert
- Session expired → Re-scan prompt
- Connection lost → Reconnect banner

---

## 5. Profile / Ranking Screen

### UI Bileşenleri
- User avatar + name + rank badge
- Stats: toplam eklenilen (songs added, upvotes, downvotes)
- Leaderboard (top 10)
- Settings (push preferences, logout)

### Analytics
- `profile_viewed`
- `leaderboard_viewed`
- `push_preference_changed`

---

## React Native Audio Stack

### Önerilen Kütüphaneler
```json
{
  "react-native-track-player": "^4.x",
  "react-native-background-fetch": "^4.x"
}
```

### Background Playback
```typescript
import TrackPlayer from 'react-native-track-player';

// Setup (App.tsx)
await TrackPlayer.setupPlayer();
await TrackPlayer.updateOptions({
  capabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
  ],
});

// Play stream
await TrackPlayer.add({
  id: 'live-radio',
  url: 'https://stream.radiotedu.com/live',
  title: 'RadioTEDU Live',
  artist: 'RadioTEDU',
  isLiveStream: true,
});
await TrackPlayer.play();
```

### Lock Screen Controls
`react-native-track-player` otomatik olarak iOS/Android lock screen ve notification center kontrollerini sağlar.
