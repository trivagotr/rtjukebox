# UI component envanteri

Bu belge `mobile/App.tsx`, `mobile/src`, `jukebox-web-controller/src` ve kiosk'un HTML/JS kaynaklarındaki React componentlerini, navigasyon ekranlarını, tekrar kullanılan yerel UI parçalarını ve ana DOM yüzeylerini listeler. UI üretmeyen servisler, yardımcı fonksiyonlar, test dosyaları ve React/React Native kütüphane primitive'leri dahil edilmemiştir. Context provider'lar ayrıca belirtilmiştir.

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
| `AdminDashboard` | `jukebox-web-controller/src/AdminDashboard.tsx` | Cihaz, şarkı, Spotify ve moderasyon yönetimi; kiosk için tek kullanımlık provisioning kodu üretme ve kopyalama. |

## Kiosk web

Kiosk düz JavaScript ve HTML ile oluşturuluyor; React component ağacı yok. Ana arayüz `kiosk-web/index.html` içindeki DOM yüzeyleri ve `kiosk-web/app.js` tarafından yönetiliyor.

| UI yüzeyi | Kaynak | Görev |
|---|---|---|
| Kiosk ana/oynatım görünümü | `kiosk-web/index.html`, `kiosk-web/app.js` | Status strip, boşta/çalan stage, albüm kapağı, parça ve istek sahibi, ilerleme, QR kartı ve kiosk çıkış kontrolü. |
| Kuyruk paneli | `kiosk-web/index.html`, `kiosk-web/app.js` | Bekleyen parçalar, istek sahibi, oy göstergesi ve boş kuyruk durumu. |
| Söz paneli | `kiosk-web/index.html`, `kiosk-web/app.js` | Söz yükleniyor, bulunamadı, boş ve senkronize satır durumları. Satırlar HTML'e eklenmeden escape edilir. |
| Cihaz kayıt/kurulum overlay'i | `kiosk-web/app.js`, `kiosk-web/config.js` | Cihaz kodu ve 15 dakikalık tek kullanımlık provisioning koduyla kiosk kaydını başlatır; dönen credential'ı yerel olarak saklar ve URL'ye eklemez. `/jukebox/kiosk/` altında çalışırken API temel adresine `/jukebox` proxy önekini ekler. |
| Spotify başlangıç overlay'i | `kiosk-web/app.js` | Eksik Spotify bağlantısı için kurulum prompt'u ve bağlantı eylemi sunar. |
| Spotify cihaz yetkilendirme overlay'i | `kiosk-web/index.html`, `kiosk-web/device-spotify-auth.js` | Spotify cihaz bağlantısı, başlatma ve durum gösterimi. |
| Oynatıcı kontrol/yönetimi | `kiosk-web/playback.js`, `kiosk-web/spotify-player.js` | Spotify web oynatıcı bağlantısı ve playback olaylarının UI'a yansıtılması. |
| Debug paneli | `kiosk-web/app.js` | Geliştirme/teşhis metrikleri; kullanıcıya dönük ana akışın parçası değildir. |
| Marka/tema adaptasyonu | `kiosk-web/branding.js`, `kiosk-web/style.css` | Marka ayarları ve görsel stil; bağımsız ekran componenti değildir. |

## Kapsam

Envanter uygulama ve ekran dosyalarındaki component tanımlarını, `RootNavigator` kayıtlarını, controller JSX componentlerini ve `kiosk-web/index.html` ile DOM üreten kiosk kodunu kapsar. Backend, test dosyaları ve UI üretmeyen servisler component listesine alınmamıştır. Context provider bileşenleri ortak componentler bölümünde listelenmiştir. Ekran dosyasının varlığı tek başına kullanıcının o ekrana erişebildiğini kanıtlamaz; navigasyon kaydı ayrıca belirtilmiştir.

## Önceki ve güncel envanter ayrımı

- **Önceden listelenen ve hâlâ mevcut olanlar:** Navigasyona kayıtlı ekranlar, ortak mobil bileşenler, controller bileşenleri ve kiosk DOM yüzeyleri yukarıdaki ana tablolardadır.
- **Güncel envanterde ayrıca görünür kılınanlar:** `ConsentScreen` ve `SplashScreen` navigator ekranı olmadıkları için ayrı uygulama akışı tablosuna alındı; önceki tabloda yalnızca açıklama notu olarak geçiyorlardı.
- Yinelenen `MainTabs` satırı tek kayda indirildi. Ekran/bileşenlerin “eski” veya “yeni” oluşu kaynak kontrol geçmişine göre değil, önceki envanterde bulunup bulunmamasına göre belirtilmiştir.
- Kaynak taramasında kiosk kurulum/Spotify başlangıç overlay'leri, kuyruk ve söz panelleri ayrı DOM/UI yüzeyleri olarak görünür kılındı; önceki liste bunları ana kiosk görünümünde topluyordu.






## Arka plan işleri (G5)

- `AdminDashboard` mevcut klasör tarama, ses işleme ve metadata sync eylemlerini 202 job yanıtı aldıktan sonra `GET /api/v1/jobs/:jobId` ile takip eder; ekran içindeki yönetim durum alanında sonuç veya hata gösterir.
- `ProfileScreen` podcast feed yönetiminde toplu sync işinin bitmesini bekler ve başarılı/başarısız feed sayılarını bildirir. Yeni feed eklemenin ilk sync'i kuyrukta başlatılır ve arka planda devam ettiği belirtilir.
- Mobil servis katmanında `mobile/src/services/jobsService.ts` ortak job polling istemcisidir; bu bir UI component değildir.

## Validation-only changes (G3 follow-up)

- Auth, profile customization, optional radio profile administration, and Spotify app-config controls keep their existing screens and route actions. Backend payload validation tightened without adding or removing UI components.

## Strict payload follow-up: jukebox admin

- Existing `AdminDashboard` actions use the same route paths and field names after backend validation was tightened for skip, device management, and song classification.
- Moderation UI/service surfaces remain unchanged; keyword, settings, artist block, and text test requests now receive strict backend validation.
- No UI components or game screens were added or changed in this phase.

## Realtime behavior and validation (2026-09-24)

- Mobile and controller jukebox views and the kiosk join device rooms through Socket.IO. Existing screens continue to receive queue, playback progress, heartbeat, skip, and force-logout updates.
- The backend now validates these event payloads strictly and disconnects expired user or kiosk sessions; component layout and event names are unchanged.

## Final non-game UI source scan — 2026-09-24

- Rechecked mobile navigation/screens, shared components, controller JSX definitions, kiosk DOM creation, and API call sites. No React component, screen, navigation entry, or kiosk panel was added or removed in this continuation.
- AdminDashboard keeps its existing device edit, playback target, moderation, provisioning, and background job status surfaces. Generic device edits now issue PATCH; playback-target config keeps its separate PUT route.
- Existing jukebox and kiosk interfaces still use the same Socket.IO event names and room workflow. Server-side validation/credential expiry did not require UI component changes.
- `mobile/src/services/jobsService.ts` remains a service, not a UI component. ProfileScreen and AdminDashboard use the previously inventoried async job status behavior.
- The existing game UI inventory was left unchanged under the no-game scope.

### Queue access control update (2026-09-24)

Kiosk queue polling sends its stored device credential as `x-kiosk-credential`. The queue endpoint checks user device sessions or matching admin/kiosk authorization before returning queue state. No component or route path changed.

## Final inventory pass — 2026-09-24

The kiosk queue poller includes `x-kiosk-credential`; the backend grants queue access only after matching the kiosk credential or an authorized user/admin session. This changed an existing API call's authorization header, not the UI component tree. The controller and mobile component inventories were rechecked; no screen, component, navigation item, or game inventory entry was changed by this final pass.

## Final non-game client scan (2026-09-24)

- `jukebox-web-controller/src/App.tsx` playback-state polling uses the logged-in controller session cookie. `kiosk-web/app.js` sends the stored kiosk credential. These headers match the backend playback-state authorization rules.
- `mobile/src/services/profileService.ts` sends profile customization and favorites through PATCH endpoints. The existing ProfileScreen and its component tree are unchanged.
- No mobile, controller, or kiosk UI called the removed `POST /api/v1/spotify/refresh`; OAuth/device authorization and playback-device UI calls remain unchanged.
- The source scan found no new UI component tied to the admin-only event QR token endpoint. No mobile, controller, or kiosk component uses health probes; these are deployment/operator endpoints.
- Controller auth now uses HttpOnly cookies for access/refresh, restores the saved user from `/auth/me`, retries one expired access request through refresh, and calls `/auth/logout`; no access token is stored in localStorage. Mobile guest login stores no refresh token and its auth service continues bearer-token requests.
- Controller cookie auth requires credentialed CORS and same-site frontend/API origins; the existing component tree is unchanged.
- No screen, component, navigation entry, or kiosk panel was added or removed in this continuation. Existing game inventory entries were not changed.

### User directory availability scan (2026-09-25)

- The web controller has a `LeaderboardView` ranking modal; it does not show a full account directory or provide user administration.
- Mobile also has a leaderboard screen, which is a ranking view rather than an admin user list. No separate user-management panel was found or added.
- Public API CORS preflight currently omits `Access-Control-Allow-Credentials` and the `x-auth-transport` request header required by the controller's cookie login. The deployed controller auth flow therefore needs a backend/proxy update before release; local source and local component tests do not prove public cookie login works.
- Fixed local auth cookie paths for subdirectory hosting: with `/jukebox`, access cookies now cover the API and Socket.IO paths, and refresh cookies cover the prefixed auth routes. The deployed build still needs this update.

### Public release status (2026-09-25)

The deployed controller page and kiosk return HTTP 200, but this confirms only static delivery. Public API CORS preflight currently omits cookie credentials, PATCH, `x-auth-transport`, and `x-kiosk-credential`; authenticated controller requests are therefore not verified against the deployed backend. `/jukebox/health/live` also returns 404. See `jukebox-live-toggle-runbook.md` before scheduling a live off/on change.

### Post-restart UI delivery and CORS verification (2026-09-25)

- Following the Jukebox service's automatic recovery/restart, local IIS returned HTTP 200 for `/jukebox/` and `/jukebox/kiosk/`.
- Login CORS preflight now returns 204 with credentials, PATCH, and the controller/kiosk custom headers. This verifies browser preflight routing, but not a signed-in controller session, cookie persistence, playback, or authenticated Socket.IO.
- No UI component or client route changed during this runtime check; the inventory remains source-derived. Browser session and socket checks are still pending.
- The user entered the controller and refreshed; backend logs record guest creation 201 and device connection 200, and the user still saw the signed-in guest after refresh. Auth cookie restore works. The selected device code is not restored by the UI after a page refresh; the user must enter it again. Authenticated Socket.IO remains to be confirmed.
- The controller's configured Socket.IO path is `/jukebox/socket.io`. Its IIS reverse-proxy target had incorrectly removed `/jukebox`; the rule is corrected. Local IIS polling and an authenticated Socket.IO room-join smoke both pass.
- Authenticated Socket.IO smoke through IIS using a current guest/device session succeeded and the device room join was logged. The transport/auth route is healthy; the user then confirmed the controller displays its device and queue.
- User-visible runtime state: the controller showed one pending `Howlin' for You` queue row while the center panel displayed `Müzik sırası boş`. This is consistent with current source behavior: the center panel is driven by `nowPlaying`, while the right queue panel is driven separately by pending `queue` items. It means no track is currently playing; the listed song is waiting in the queue.

## Backend-refactor etki taraması (2026-09-26)

Mobil, web controller ve kiosk kaynakları yeniden tarandı. Bu backend refactor'u henüz `backend/` uygulamasına mount edilmediğinden UI component ağacında veya kullanıcı akışlarında değişiklik yok; mevcut istemciler hâlâ aktif backend API'sini çağırıyor. Refactor route'larıyla eşleşen UI yüzeyleri şunlardır:

- Mobil `JukeboxScreen`: cihaz keşfi, bağlanma, şarkı arama, kuyruğa ekleme ve oy verme.
- Web controller `JukeboxView` ve `QueueItem`: kuyruk, oynatma durumu, oy ve söz görünümü.
- Web controller `AdminDashboard`: cihaz CRUD/provisioning, kiosk logout, şarkı upload/process/scan, moderasyon, Spotify app/device ayarları ve job ilerlemesi.
- Kiosk DOM yüzeyleri (`kiosk-web/app.js`, `device-spotify-auth.js`, `playback.js`, `spotify-player.js`): kayıt, kuyruk, autoplay tetikleme, now-playing, Spotify authorization ve playback-state.

Endpoint çağrısı/contract eşlemesi [endpoint envanterindeki refactor taramasında](endpoint-envanteri.md#backend-refactor-son-taramasi-2026-09-26-izole-uygulama) ayrıca listelenmiştir. Bu güncelleme oyun ekranlarını veya bileşenlerini değiştirmez; envanterdeki oyun kayıtları olduğu gibi korunmuştur.
### Backend refactor UI impact re-scan (2026-09-26)

- Rechecked mobile, web controller, kiosk, and admin component API references after the backend changes. Existing UI calls still use the retained Spotify-specific playback-target `PUT`; no component currently calls the new provider-shaped `PATCH`.
- The `GET /users/me?include=profile` form is available to clients, while the existing profile routes remain for current mobile/controller callers.
- No UI component or game/gamification component changed as part of this pass. The component inventory’s existing live-backend references remain unchanged; the refactor remains isolated and does not imply deployment.

### Backend refactor final UI/socket contract scan (2026-09-26)

- Rechecked web controller, kiosk, and mobile client references against the isolated refactor route/event surface. Client source and component behavior were not changed in this pass; production clients still call the active `backend/` service.
- Preserved kiosk Socket.IO compatibility for raw UUID `join_device`, and validated `leave_device`, `playback_progress`, and `kiosk_heartbeat`. The refactor Socket.IO transport path includes the configured public base path.
- Kiosk queue updates continue to use the existing `queue_updated` shape. Heartbeat-triggered playback recovery and profile jingle/ad insertion are backend behaviors and require staging/device verification before cutover.
- No UI component or game/gamification component was modified. The refactor is isolated and not deployed.

### Architecture audit addendum (2026-09-26)

- No UI contract changed in the final architecture pass. Existing UI and kiosk calls remain mapped to the compatible refactor routes/events; OAuth HTTP abstraction and injected clock/ID ports are backend internals.
- Verification: refactor build/lint and 25 tests pass. There has been no deployment or production service/database change.
