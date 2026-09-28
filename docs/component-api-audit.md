# RadioTEDU Jukebox — Component API audit

Audit date: 2026-09-28

Scope: the project at rtjukebox/. Per-component records are in docs/component-api-catalog.json; the validation schema is docs/component-api.schema.json. Paths in those artifacts are relative to rtjukebox/.

The scan counted active TSX/JSX source and private components nested in screen files. It excluded tests, .bak_* files, dependencies, build output and generated code. It found 64 React components in 35 component-bearing files; jukebox-web-controller/src/main.tsx is a bootstrap file, not a component. kiosk-web is a separate HTML/CSS/vanilla-JavaScript application; its DOM regions are recorded separately rather than mislabeled as React components.

## A. Proje Özeti

| Alan | Bulgular |
|---|---|
| Mobil istemci | React Native 0.76.9, React 18.3.1, TypeScript 5.0.4; Android/iOS native projects and React Native screens |
| Web controller | React/React DOM 19.2, Vite 7.2, TypeScript 5.9; SPA |
| Kiosk web | Vanilla JavaScript, static HTML/CSS; no React component system |
| Mobil routing | React Navigation bottom-tabs and native-stack |
| Web routing | React Router yok; App state and conditional rendering/modals |
| State | React useState/useContext; Auth, Channel, Metadata, Consent contexts; Zustand 5 player store |
| HTTP/API | axios; REST endpoints are mounted under /api/v1 |
| Real-time | socket.io-client for jukebox queue/playback |
| UI kit | MUI, Chakra, shadcn, React Native Paper bulunmadı. Web: lucide-react. Mobil: react-native-vector-icons and native primitives. |
| Backend | backend/: Express 4 + pg + Socket.IO. backend-refactor/: Express 5, modular router/controller/service/port design, Prisma 7 + pg, OpenAPI generation script. |

Repo tek paketli değildir; mobil, web controller, kiosk ve iki backend içinde ayrı package.json dosyaları vardır. React ve TypeScript sürümleri web ile mobil arasında farklıdır.

Mevcut backend route mount grupları /api/v1/auth, /podcasts, /podcast-feeds, /radio, /radio-profiles, /jukebox, /users, /spotify, /gamification, /profile ve /jobs. İstemciler REST için axios; canlı güncellemeler için Socket.IO kullanır. Web event adları arasında join_device, leave_device, queue_updated, force_logout, playback_progress ve song_skipped var.

Mevcut projede /api/components endpoint’i veya UI component metadata servisi yoktur. Bu rapordaki component endpoint’leri yeni ve salt okunur katalog API tasarımıdır; kaynak component’lerin davranışını değiştirmez.

### Klasör ve dosya yapısı

Tarama kapsamı (node_modules, .git, build/dist, coverage, .expo, generated, native android/ios klasörleri hariç) 584 dosyaydı.

| Klasör | Dosya / alt klasör | Rol |
|---|---:|---|
| mobile/ | 105 / 22 | React Native uygulama, TS ekranları, services, store, i18n, theme; android/ios native projeleri ayrıca var |
| jukebox-web-controller/ | 40 / 4 | Vite React jukebox istemcisi |
| kiosk-web/ | 22 / 2 | Statik kiosk HTML, CSS ve JavaScript |
| backend/ | 127 / 14 | Express 4 API ve Socket.IO |
| backend-refactor/ | 180 / 56 | Express 5/Prisma modüler backend ve migration’lar |
| docs/ | 38 / 4 | Mimari, ürün ve operasyon belgeleri |
| .planning/ | 19 / 4 | Planlama ve milestone belgeleri |
| e2e/ | 5 / 1 | E2E testleri |
| .github/, .vscode/, scripts/ | küçük | CI, editör ve script yapılandırmaları |

Kök dosyaları README, AGENTS yönergeleri, güvenlik/backend notları, kiosk setup belgesi ve logo varlıklarını içerir. mobile/src içinde components, context, navigation, privacy, screens, services, store, theme ve utils ayrımı vardır. backend/ ve backend-refactor/ aynı ürün alanında iki backend ağacı sunar.

kiosk-web/index.html, app.js ve style.css statik UI’dır. Gerçek DOM id’leri idleState, playingState, lyricsCard, qrCode, queueList, connectionBadge, albumArt ve audioPlayer gibi bölgeleri gösterir; bunlar React component’i değildir.

## B. Component Envanteri

| Dosya | Component’ler |
|---|---|
| jukebox-web-controller/src/App.tsx | App, LoginView, LeaderboardView, SongCover, QueueItem, SyncedLyricsCard, JukeboxView |
| jukebox-web-controller/src/AdminDashboard.tsx | AdminDashboard |
| mobile/App.tsx | App, ConsentGate |
| mobile/src/components/AuthGuard.tsx | AuthGuard |
| mobile/src/components/GlobalHeader.tsx | GlobalHeader |
| mobile/src/components/MiniPlayer.tsx | MiniPlayer |
| mobile/src/components/PageTransition.tsx | PageTransition |
| mobile/src/context/AuthContext.tsx | AuthProvider |
| mobile/src/context/ChannelContext.tsx | ChannelProvider |
| mobile/src/context/MetadataContext.tsx | MetadataProvider |
| mobile/src/navigation/RootNavigator.tsx | AuthStack, MainTabs, RootNavigator |
| mobile/src/privacy/ConsentContext.tsx | ConsentProvider |
| mobile/src/screens/auth/LoginScreen.tsx | LoginScreen |
| mobile/src/screens/auth/RegisterScreen.tsx | RegisterScreen |
| mobile/src/screens/ConsentScreen.tsx | ConsentScreen |
| mobile/src/screens/EventsScreen.tsx | Empty, EventsScreen |
| mobile/src/screens/FocusScreen.tsx | FocusScreen |
| mobile/src/screens/games/GameChrome.tsx | GameShell, ComboMeter, FeedbackToast, GameResultModal |
| mobile/src/screens/games/MemoryGameScreen.tsx | MemoryGameScreen |
| mobile/src/screens/games/RhythmTapScreen.tsx | RhythmTapScreen |
| mobile/src/screens/games/SnakeScreen.tsx | ControlButton, SnakeScreen |
| mobile/src/screens/games/TetrisScreen.tsx | MiniPiece, ControlButton, TetrisScreen |
| mobile/src/screens/games/WordGuessScreen.tsx | WordGuessScreen |
| mobile/src/screens/GamesScreen.tsx | Empty, GamesScreen |
| mobile/src/screens/HomeScreen.tsx | MetricCard, QuickAction, SectionHeader, EventPreview, GamePreview, MarketPreview, EmptyCard, HomeScreen |
| mobile/src/screens/jukebox/JukeboxScreen.tsx | JukeboxScreen, NowPlayingHero |
| mobile/src/screens/LanguageScreen.tsx | LanguageScreen |
| mobile/src/screens/LeaderboardScreen.tsx | LeaderboardScreen |
| mobile/src/screens/MarketScreen.tsx | MarketScreen |
| mobile/src/screens/PlayerScreen.tsx | PlayerScreen |
| mobile/src/screens/PodcastScreen.tsx | PodcastScreen |
| mobile/src/screens/PrivacyScreen.tsx | PrivacyScreen |
| mobile/src/screens/ProfileScreen.tsx | FavoriteDisplay, ProfileScreen |
| mobile/src/screens/RadioScreen.tsx | FavoriteCard, ChannelGridCard, HistoryModal, RadioScreen |
| mobile/src/screens/SplashScreen.tsx | SplashScreen |

App (web/mobile), Empty (Events/Games) ve ControlButton (Snake/Tetris) ayrı dosya içi tanımlardır. Katalog bunlara path-based unique ID verir. RN View/Text, HTML elementleri, icon exports, context nesneleri, hook’lar ve JSX döndürmeyen yardımcı fonksiyonlar custom component sayımına dahil değildir.

Category etiketleri katalogda Layout, Navigation, Form, Input, Button, Modal/Dialog, Table, Card, List, Data visualization, Feedback, Authentication, Page-level, Utility ve Other için tanımlanmıştır. Bağımsız Table/Input component’i yok; ilgili markup ekran/dashboard içinde bulunur.

## C. Component API Specification

Her component için purpose, dosya yolu, gerçek prop adları/tipleri, required/default bilgisi, callbacks/events, local state, dependencies, usedBy, variants, responsive davranış ve loading/error/empty bulgusu docs/component-api-catalog.json içindedir. Belirsiz kaynak bilgileri unknown veya needs_review olarak işaretlenmiştir.

UI’de kullanılan başlıca gerçek TS types:

| Type/interface | Kaynak | Kullanım |
|---|---|---|
| AdminDashboardProps, DeviceSummary, PlaylistPreview | jukebox-web-controller/src/AdminDashboard.tsx | AdminDashboard |
| LoginViewProps, LeaderboardViewProps, QueueItemProps, JukeboxViewProps, QueueSong, AppUser, ProgressState, LyricsData | jukebox-web-controller/src/App.tsx | Web controller |
| User, AuthContextType | mobile/src/context/AuthContext.tsx | AuthProvider ve ekranlar |
| TrackMetadata, MetadataContextType | mobile/src/context/MetadataContext.tsx | MetadataProvider, MiniPlayer, Player/Radio |
| ChannelContextType, RadioChannel | mobile/src/context/ChannelContext.tsx, mobile/src/data/radioChannels.ts | ChannelProvider, Radio/Player |
| ConsentState, ConsentContextType, AgeRange, Gender | mobile/src/privacy/ConsentContext.tsx | ConsentProvider, ConsentScreen, PrivacyScreen |
| GamificationHome, GamificationPoints, AppEvent, ArcadeGame, MarketItem | mobile/src/services/gamificationService.ts | Home, Events, Games, Market, Leaderboard |
| Podcast, PodcastFeedRow, ProfileCustomization, UserBadge | mobile/src/services/podcastService.ts, podcastFeedsAdmin.ts, profileService.ts | Podcast/Profile |
| GameShellProps, SplashScreenProps | mobile/src/screens/games/GameChrome.tsx, mobile/src/screens/SplashScreen.tsx | Game chrome/splash |
| PlayerState | mobile/src/store/usePlayer.ts | Zustand player store |

Önemli prop yüzeyleri: web AdminDashboardProps token/device/onSelectDevice/onClose; JukeboxViewProps ve LoginViewProps App.tsx içindeki gerçek interface’lere bağlı; PageTransitionProps ViewProps’u genişletir; GameShellProps typed callback/children sunar; HistoryModal ve bazı navigation props’ları any kullanır. Tam alanlar katalogda bulunur.

## D. JSON Schema

docs/component-api.schema.json, component metadata nesnesinin JSON Schema tanımıdır. Props nesnesi gerçek TS type bilgisini taşıyan type, required, opsiyonel default ve sourceType alanlarını kullanır. State, events, dependencies, usedBy, variants, responsive ve UI state alanları da şemaya dahil edilmiştir.

## E. REST API Tasarımı

Bu endpoint’ler öneridir; mevcut kodda yoktur. Katalog build sırasında kaynaklardan üretilen statik JSON olarak sunulabilir.

| Method | Path | Davranış |
|---|---|---|
| GET | /api/components | Katalog; platform, category, search, limit, cursor filtreleri opsiyonel |
| GET | /api/components/:name | id veya benzersiz slug ile component metadata |
| GET | /api/components/:name/props | Props tipi, required/default bilgisi ve callback adları |
| GET | /api/components/:name/usage | usedBy ve component bağımlılıkları |

GET /api/components?platform=web&limit=2:

    {
      "data": [
        {
          "id": "web-controller--admin-dashboard",
          "name": "AdminDashboard",
          "path": "jukebox-web-controller/src/AdminDashboard.tsx",
          "platform": "web",
          "category": "page-level",
          "description": "Cihaz, Spotify playback, playlist, moderation ve katalog ayarlarını yöneten admin ekranı."
        },
        {
          "id": "web-controller--app",
          "name": "App",
          "path": "jukebox-web-controller/src/App.tsx",
          "platform": "web",
          "category": "page-level",
          "description": "Device code/login, jukebox, leaderboard ve admin görünümünü koordine eden SPA root’u."
        }
      ],
      "meta": {"total": 8, "limit": 2, "nextCursor": "web-controller--app"}
    }

GET /api/components/web-controller--admin-dashboard:

    {
      "data": {
        "id": "web-controller--admin-dashboard",
        "name": "AdminDashboard",
        "path": "jukebox-web-controller/src/AdminDashboard.tsx",
        "platform": "web",
        "category": "page-level",
        "props": {
          "token": {"type": "string", "required": true},
          "device": {"type": "DeviceSummary", "required": true, "sourceType": "jukebox-web-controller/src/AdminDashboard.tsx"},
          "onSelectDevice": {"type": "(device: DeviceSummary) => void", "required": false, "event": true},
          "onClose": {"type": "() => void", "required": false, "event": true}
        },
        "events": ["onSelectDevice", "onClose"],
        "state": ["activeTab", "loading", "status", "devices", "songs", "spotifyPlaybackDevices", "moderationSettings", "playlistPreview"],
        "dependencies": {"components": [], "modules": ["axios", "lucide-react", "./runtimeConfig"]},
        "usedBy": ["jukebox-web-controller/src/App.tsx"]
      }
    }

GET /api/components/web-controller--admin-dashboard/props:

    {
      "data": {
        "componentId": "web-controller--admin-dashboard",
        "propsType": "AdminDashboardProps",
        "props": {
          "token": {"type": "string", "required": true},
          "device": {"type": "DeviceSummary", "required": true},
          "onSelectDevice": {"type": "(device: DeviceSummary) => void", "required": false, "event": true},
          "onClose": {"type": "() => void", "required": false, "event": true}
        }
      }
    }

GET /api/components/mobile--home-screen/usage:

    {
      "data": {
        "componentId": "mobile--home-screen",
        "usedBy": ["RootNavigator.MainTabs"],
        "dependencies": ["GlobalHeader", "PageTransition", "MetricCard", "QuickAction", "SectionHeader", "EventPreview", "GamePreview", "MarketPreview", "EmptyCard"]
      }
    }

App, Empty ve ControlButton adları birden fazla kez tanımlı. Canonical key olarak katalogdaki ID kullanılmalı; belirsiz /api/components/App isteği 409 ve eşleşen ID’leri dönmelidir. Metadata statik/read-only olduğu için POST/PUT/PATCH/DELETE gerekmiyor. Katalog veritabanı üzerinden elle yönetilecekse ayrı yetkili write endpoint’leri değerlendirilebilir; bunlar mevcut projeye ait değildir.

## F. Component Dependency Tree

    mobile/index.js
      App
        ConsentProvider, AuthProvider, MetadataProvider, ChannelProvider
        ConsentGate
          SplashScreen
          ConsentScreen
          RootNavigator
            AuthStack
              AuthGuard (Prompt route), LoginScreen, RegisterScreen
            MainTabs
              HomeScreen
                GlobalHeader, PageTransition
                MetricCard, QuickAction, SectionHeader, EventPreview,
                GamePreview, MarketPreview, EmptyCard
              RadioScreen
                GlobalHeader, PageTransition, FavoriteCard,
                ChannelGridCard, HistoryModal
              PodcastScreen: GlobalHeader, PageTransition
              JukeboxScreen: GlobalHeader, PageTransition, NowPlayingHero
              LeaderboardScreen: GlobalHeader, PageTransition
              ProfileScreen: FavoriteDisplay
              EventsScreen: Empty
              GamesScreen: Empty
            FocusScreen, MarketScreen, PlayerScreen, LanguageScreen,
            PrivacyScreen, SnakeScreen, MemoryGameScreen, TetrisScreen,
            RhythmTapScreen, WordGuessScreen
              GameShell, FeedbackToast, GameResultModal, ComboMeter
              SnakeScreen: ControlButton
              TetrisScreen: ControlButton, MiniPiece
        MiniPlayer

    jukebox-web-controller/src/main.tsx
      App
        LoginView, JukeboxView, LeaderboardView, AdminDashboard
        JukeboxView: SongCover, SyncedLyricsCard, QueueItem
        QueueItem: SongCover

Game screens GamesScreen’den navigation route’u ile açılır; JSX’te statik child olarak görünmeyen bu ilişki katalogda usage bilgisine dahil edilmiştir.

## G. Eksikler ve Problemler

1. Merkezi UI kit/design system yok; form, button, card ve table markup’ı çoğunlukla ekran dosyalarında.
2. Web controller’daki yedi component App.tsx içinde; dosya 1.000+ satır. AdminDashboard ve bazı mobil ekranlar da büyük sayfa monolith’leri.
3. EventsScreen.Empty ile GamesScreen.Empty aynı prop ve markup’ı tekrarlar. Snake/Tetris ControlButton yakın kopyadır; Tetris sürümünde optional disabled prop vardır.
4. JukeboxScreen.route, LanguageScreen.navigation, FocusScreen.navigation, PrivacyScreen.navigation, NowPlayingHero.song, HistoryModal.history/renderItem ve Zustand PlayerState.track any kullanıyor.
5. Merkezi typed route-param listesi yok; useNavigation<any>() ve any route props’ları mevcut.
6. Loading/error/empty UI birçok sayfada inline; reusable Loading/Error/EmptyState katmanı bulunmuyor.
7. Storybook/component metadata şeması/component API endpoint’i yok. React 18 ve React 19 paketleri ortak runtime component kütüphanesi varsayımını geçersiz kılıyor.
8. backend/ (Express 4) ve backend-refactor/ (Express 5/Prisma) paralel API ağaçları. Yeni katalog endpoint’inin hedef backend’i deployment/source-of-truth kararı gerektirir.
9. Component varyantları çoğunlukla API prop’u olarak tanımlanmamış; mevcut state/style davranışları yeni props’a dönüştürülmedi.
10. Responsive davranış web CSS media query’lerinde ve mobil flex/safe-area düzenlerinde dağınık; ortak breakpoint sözleşmesi yok.

## H. Önerilen API klasör yapısı

Refactor backend’in mevcut router/controller/service/schema düzenine eklenecek read-only katalog:

    backend-refactor/src/modules/components/
      components.module.ts
      components.router.ts
      components.controller.ts
      components.service.ts
      components.repository.ts
      components.schema.ts
      components.dto.ts
      data/component-catalog.generated.json
      __tests__/components.router.test.ts

    scripts/generate-component-catalog.ts
    docs/component-api-audit.md
    docs/component-api-catalog.json
    docs/component-api.schema.json

generate-component-catalog.ts kaynak TSX/type’larından katalog JSON’u üretmeli; endpoint yalnızca generated/versioned metadata okumalı. Props için hem kaynak kod hem elle tutulan ikinci bir DB kopyası source-of-truth yapılmamalı. Bu modül ve endpoint’ler şu an repo’da yoktur; yapı öneridir.
