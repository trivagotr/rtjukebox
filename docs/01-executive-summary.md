# RadioTEDU Superapp - Executive Summary

## Proje Özeti
RadioTEDU Superapp, iOS ve Android için tek codebase ile geliştirilecek cross-platform mobil uygulama. Dört ana modül içerir: Canlı Radyo, Podcastler, Push Bildirimler ve Yemekhane Jukebox.

## Teknoloji Kararları

| Katman | Seçim | Gerekçe |
|--------|-------|---------|
| **Mobil** | React Native | Daha olgun ecosystem, npm kütüphaneleri, background audio için `react-native-track-player` mükemmel destek |
| **Backend** | Node.js + TypeScript | Type safety, Windows Server uyumlu, hızlı geliştirme |
| **Veritabanı** | PostgreSQL | JSON desteği, complex query'ler, daha iyi indexing, açık kaynak |
| **Cache** | Redis | Session yönetimi, realtime leaderboard, rate limiting |
| **Realtime** | Socket.IO | WebSocket + fallback, room-based broadcasting |
| **Push** | FCM | Tek SDK ile Android + iOS desteği |

## Sistem Bileşenleri

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTS                                  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  iOS App     │ Android App  │ Kiosk App    │  Admin Web     │
│ (React Native)│(React Native)│ (standalone) │  (optional)    │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                │
       └──────────────┴──────────────┴────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Reverse Proxy   │
                    │   (Caddy/nginx)   │
                    │   SSL Termination │
                    └─────────┬─────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼──────┐     ┌─────────▼─────────┐    ┌──────▼──────┐
│  REST API   │     │   Socket.IO       │    │  Static     │
│  (Express)  │     │   (Realtime)      │    │  Files      │
└──────┬──────┘     └─────────┬─────────┘    │  (Music)    │
       │                      │              └─────────────┘
       └──────────┬───────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌─────▼─────┐   ┌───▼───┐
│ Redis │   │ PostgreSQL│   │  FCM  │
│ Cache │   │    DB     │   │ Push  │
└───────┘   └───────────┘   └───────┘
```

## MVP Kapsamı (8 hafta)
1. **Hafta 1-2**: Backend altyapı + Auth + DB
2. **Hafta 3-4**: Canlı Radyo + Podcast modülü
3. **Hafta 5-6**: Jukebox temel akış
4. **Hafta 7**: Push notifications
5. **Hafta 8**: Test + Deploy

## V2 Kapsamı
- Offline podcast indirme
- Gelişmiş analytics
- Admin dashboard
- Çoklu kiosk desteği
