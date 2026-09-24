# UI component envanteri

Bu belge uygulama kaynaklarında tanımlı ekranları, yeniden kullanılan UI componentlerini ve kiosk arayüzünün ana DOM yüzeylerini listeler. UI üretmeyen servisler, yardımcı fonksiyonlar ve test dosyaları dahil edilmemiştir. Context provider bileşenleri ayrıca listelenmiştir.

## Mobil uygulama

### Uygulama kabuğu ve ortak componentler

| Component | Kaynak | Görev |
|---|---|---|
| `App` | `mobile/App.tsx` | Uygulama başlangıcı, provider ağacı, audio player setup, deep linking ve splash/consent geçişlerini yönetir. |
| `SafeAreaProvider` | `mobile/App.tsx` | Uygulama genelinde güvenli ekran alanı inset'lerini sağlar. |
| `ConsentGate` | `mobile/App.tsx` | İzin kararına göre consent ekranını, navigator ve splash katmanını gösterir. |
| `RootNavigator` | `mobile/src/navigation/RootNavigator.tsx` | Ana stack'i kurar; oturum yükleme ekranı, tab navigasyonu, modal oynatıcı, auth akışı ve diğer ekranları bağlar. |
| `MainTabs` | `mobile/src/navigation/RootNavigator.tsx` | Ana sayfa, radyo, podcast, jukebox ve sıralama tablarını gösterir. |
| `AuthStack` | `mobile/src/navigation/RootNavigator.tsx` | Auth prompt, giriş ve kayıt akışlarını gruplar. |
| `AuthGuard` | `mobile/src/components/AuthGuard.tsx` | Oturumsuz kullanıcıya giriş/kayıt yönlendirme arayüzü sunar. |
| `GlobalHeader` | `mobile/src/components/GlobalHeader.tsx` | Global başlık ve navigasyon eylemleri. |
| `MiniPlayer` | `mobile/src/components/MiniPlayer.tsx` | Uygulama içindeki kompakt oynatıcı kontrolleri. |
| `PageTransition` | `mobile/src/components/PageTransition.tsx` | Ekran geçiş animasyonu sarmalayıcısı. |
| `ConsentProvider` | `mobile/src/privacy/ConsentContext.tsx` | UI değil; izin durumunu sağlayan uygulama context'i. |
| `AuthProvider` | `mobile/src/context/AuthContext.tsx` | Oturum ve auth işlemlerini alt ağaç bileşenlerine sağlar. |
| `ChannelProvider` | `mobile/src/context/ChannelContext.tsx` | Aktif kanal durumunu alt bileşenlere sağlar. |
| `MetadataProvider` | `mobile/src/context/MetadataContext.tsx` | Oynatma metadata durumunu alt bileşenlere sağlar. |

### Navigasyona kayıtlı ekranlar

| Ekran | Kaynak | Görev |
|---|---|---|
| `HomeScreen` | `mobile/src/screens/HomeScreen.tsx` | Özet, metrikler ve hızlı erişim kartları. |
| `RadioScreen` | `mobile/src/screens/RadioScreen.tsx` | Radyo kanalları, favoriler ve dinleme geçmişi. |
| `PodcastScreen` | `mobile/src/screens/PodcastScreen.tsx` | Podcast listesi ve bölüm seçimi. |
| `JukeboxScreen` | `mobile/src/screens/jukebox/JukeboxScreen.tsx` | Cihaz bağlantısı, şarkı arama, kuyruk ve oy verme. |
| `LeaderboardScreen` | `mobile/src/screens/LeaderboardScreen.tsx` | Kullanıcı sıralaması. |
| `PlayerScreen` | `mobile/src/screens/PlayerScreen.tsx` | Tam ekran ses oynatıcı. |
| `ProfileScreen` | `mobile/src/screens/ProfileScreen.tsx` | Profil, avatar, tercihler ve podcast feed yönetimi. |
| `LanguageScreen` | `mobile/src/screens/LanguageScreen.tsx` | Dil seçimi. |
| `FocusScreen` | `mobile/src/screens/FocusScreen.tsx` | Odak zamanlayıcısı ve görev arayüzü. |
| `PrivacyScreen` | `mobile/src/screens/PrivacyScreen.tsx` | Gizlilik bilgileri ve hesap işlemleri bağlantıları. |
| `EventsScreen` | `mobile/src/screens/EventsScreen.tsx` | Etkinlikler, kayıtlar ve QR ödül akışı. |
| `GamesScreen` | `mobile/src/screens/GamesScreen.tsx` | Oyun kataloğu. |
| `MarketScreen` | `mobile/src/screens/MarketScreen.tsx` | Ödül/market kataloğu ve kullanımı. |
| `SnakeScreen` | `mobile/src/screens/games/SnakeScreen.tsx` | Snake oyunu. |
| `MemoryGameScreen` | `mobile/src/screens/games/MemoryGameScreen.tsx` | Hafıza eşleştirme oyunu. |
| `TetrisScreen` | `mobile/src/screens/games/TetrisScreen.tsx` | Tetris oyunu. |
| `RhythmTapScreen` | `mobile/src/screens/games/RhythmTapScreen.tsx` | Ritim/tap oyunu. |
| `WordGuessScreen` | `mobile/src/screens/games/WordGuessScreen.tsx` | Kelime tahmin oyunu. |
| `LoginScreen` | `mobile/src/screens/auth/LoginScreen.tsx` | Kullanıcı girişi. |
| `RegisterScreen` | `mobile/src/screens/auth/RegisterScreen.tsx` | Hesap oluşturma. |

### Uygulama akışında gösterilen ekranlar

| Ekran | Kaynak | Gösterim koşulu |
|---|---|---|
| `ConsentScreen` | `mobile/src/screens/ConsentScreen.tsx` | İlk açılışta veya izin kararı henüz verilmemişse `ConsentGate` gösterir. |
| `SplashScreen` | `mobile/src/screens/SplashScreen.tsx` | İzin tamamlandıktan sonra `ConsentGate`, splash görünür olduğu sürece gösterir. |

Bu iki ekran `RootNavigator`'a kayıtlı değildir; `App.tsx` içindeki `ConsentGate` tarafından uygulama akışında gösterilir.

### Mobil ekran içi tekrar kullanılabilir componentler

| Component | Kaynak | Kullanım |
|---|---|---|
| `MetricCard`, `QuickAction`, `SectionHeader`, `EventPreview`, `GamePreview`, `MarketPreview`, `EmptyCard` | `mobile/src/screens/HomeScreen.tsx` | Ana sayfa metrik, eylem ve içerik kartları. |
| `FavoriteCard`, `ChannelGridCard`, `HistoryModal` | `mobile/src/screens/RadioScreen.tsx` | Favori/kanal kartı ve geçmiş modalı. |
| `Empty` | `mobile/src/screens/EventsScreen.tsx`, `mobile/src/screens/GamesScreen.tsx` | Boş liste durumu. Her dosyada yerel tanımlıdır. |
| `FavoriteDisplay` | `mobile/src/screens/ProfileScreen.tsx` | Profil tercihlerini özetleyen satır/kart. |
| `NowPlayingHero` | `mobile/src/screens/jukebox/JukeboxScreen.tsx` | Jukebox çalan parça vurgusu. |
| `GameShell`, `ComboMeter`, `FeedbackToast`, `GameResultModal` | `mobile/src/screens/games/GameChrome.tsx` | Oyun ekranı kabuğu, combo göstergesi, geri bildirim ve sonuç modalı. |
| `ControlButton` | `mobile/src/screens/games/SnakeScreen.tsx`, `mobile/src/screens/games/TetrisScreen.tsx` | Dokunmatik oyun kontrolleri; dosya başına yerel component. |
| `MiniPiece` | `mobile/src/screens/games/TetrisScreen.tsx` | Küçük Tetris parça önizlemesi. |

## Web controller

| Component | Kaynak | Görev |
|---|---|---|
| `App` | `jukebox-web-controller/src/App.tsx` | Ana controller uygulaması; kullanıcı, cihaz, kuyruk ve ekran durumlarını yönetir. |
| `LoginView` | `jukebox-web-controller/src/App.tsx` | Giriş ve misafir oturumu arayüzü. |
| `LeaderboardView` | `jukebox-web-controller/src/App.tsx` | Sıralama paneli. |
| `SongCover` | `jukebox-web-controller/src/App.tsx` | Şarkı kapak görseli ve fallback. |
| `QueueItem` | `jukebox-web-controller/src/App.tsx` | Kuyruk satırı ve oy verme kontrolleri. |
| `SyncedLyricsCard` | `jukebox-web-controller/src/App.tsx` | Senkronize söz kartı. |
| `JukeboxView` | `jukebox-web-controller/src/App.tsx` | Jukebox ana görünümü, katalog, çalan parça ve kuyruk. |
| `AdminDashboard` | `jukebox-web-controller/src/AdminDashboard.tsx` | Cihaz, şarkı, Spotify ve moderasyon yönetim paneli. |

## Kiosk web

Kiosk düz JavaScript ve HTML ile oluşturuluyor; React component ağacı yok. Ana arayüz `kiosk-web/index.html` içindeki DOM yüzeyleri ve `kiosk-web/app.js` tarafından yönetiliyor.

| UI yüzeyi | Kaynak | Görev |
|---|---|---|
| Kiosk ana/oynatım görünümü | `kiosk-web/index.html`, `kiosk-web/app.js` | O an çalan parça, oynatma durumu ve kiosk ana ekranı. |
| Cihaz kayıt/kurulum görünümü | `kiosk-web/index.html`, `kiosk-web/app.js` | Kiosk cihazını backend'e kaydetme ve kurulum durumu. |
| Spotify cihaz yetkilendirme overlay'i | `kiosk-web/index.html`, `kiosk-web/device-spotify-auth.js` | Spotify cihaz bağlantısı, başlatma ve durum gösterimi. |
| Oynatıcı kontrol/yönetimi | `kiosk-web/playback.js`, `kiosk-web/spotify-player.js` | Spotify web oynatıcı bağlantısı ve playback olaylarının UI'a yansıtılması. |
| Marka/tema adaptasyonu | `kiosk-web/branding.js`, `kiosk-web/style.css` | Marka ayarları ve görsel stil; bağımsız ekran componenti değildir. |

## Kapsam

Envanter `mobile/src`, `jukebox-web-controller/src` ve kiosk'un HTML/JS kaynaklarını kapsar. Backend, test dosyaları ve UI üretmeyen servisler component listesine alınmamıştır. Context provider bileşenleri ortak componentler bölümünde listelenmiştir. Ekran dosyasının varlığı tek başına kullanıcının o ekrana erişebildiğini kanıtlamaz; navigasyon kaydı ayrıca belirtilmiştir.

## Önceki ve güncel envanter ayrımı

- **Önceden listelenen ve hâlâ mevcut olanlar:** Navigasyona kayıtlı ekranlar, ortak mobil bileşenler, controller bileşenleri ve kiosk DOM yüzeyleri yukarıdaki ana tablolardadır.
- **Güncel envanterde ayrıca görünür kılınanlar:** `ConsentScreen` ve `SplashScreen` navigator ekranı olmadıkları için ayrı uygulama akışı tablosuna alındı; önceki tabloda yalnızca açıklama notu olarak geçiyorlardı.
- Yinelenen `MainTabs` satırı tek kayda indirildi. Ekran/bileşenlerin “eski” veya “yeni” oluşu kaynak kontrol geçmişine göre değil, önceki envanterde bulunup bulunmamasına göre belirtilmiştir.





