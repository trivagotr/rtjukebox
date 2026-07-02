# Android Modern Publish Readiness

This app ships modern Android integrations as production features, not internal-only Labs.

RadioTEDU supports all applicable Android beta/preview readiness surfaces through runtime-gated media, notification, car, adaptive layout, and audit layers. Store approval, Android Auto review, Google Maps media-control surfacing, and real head-unit behavior are ready for validation but still require Google review or real device/emulator testing.

## Published System Integrations

- **Notification visibility:** `POST_NOTIFICATIONS` is declared and the Profile screen exposes a runtime permission action for Android 13+.
- **Media surfaces:** React Native Track Player owns the media notification, lock screen, headset/Bluetooth controls, and media session metadata.
- **Android Auto / Automotive:** `RadioTeduCarService` is the app media browser service; the mobile and automotive variants keep separate feature declarations.
- **Study safety:** Study, Çim alan, avatar clothes, Spark, and Rock are phone-only app surfaces and must not appear in Android Auto browse trees, voice actions, playback queues, or car templates.
- **Live Updates readiness:** Android 16+ is detected in the readiness matrix. Live radio, active podcast playback, jukebox queue state, and event countdowns use a media notification fallback below API 36.
- **Google Analytics:** GA4 Measurement Protocol remains consent-gated and disabled until credentials are configured.
- **Push notifications:** backend `/api/v1/notifications/*` routes handle device token registration, preference updates, dry runs, and admin sends.
- **Admin sending panel:** the web controller includes a production notification composer with dry-run default, audience targeting, deep links, and delivery counts.

## Android 16 Live Updates

RadioTEDU treats Live Updates as a platform-gated surface, not a separate product mode.

- API 36+ ongoing, user-visible activities can resolve to `live-update`.
- Older Android versions use the existing media notification fallback for radio, podcast, and jukebox audio.
- Event countdowns use standard notification fallback until platform support is available.
- The fallback path remains first-class so playback and queue visibility still work on Android 13, 14, and 15.

## Smart Notification Center

The admin sender is production-facing:

- Audience targeting: all opted-in users, podcast, radio, jukebox, and events.
- Deep links: `radiotedu://podcasts/latest`, `radiotedu://jukebox/<code>`, and other app routes.
- Dry-run preview: dry-run is the default in the web controller and records an audit row.
- Audit log: backend `notification_audit_logs` stores admin, category, audience, counts, dry-run flag, and payload summary.
- FCM delivery stats: admin stats show total sends, targeted devices, successful deliveries, failures, and recent runs.

## Android Auto and Car QA

- Voice actions are mapped for "Play Radio TEDU", "Play latest podcast", and "Open jukebox".
- The manifest declares `MEDIA_PLAY_FROM_SEARCH`.
- The native car media browser exposes radio, podcasts, rankings, and a driver-safe listen-only jukebox.
- Study, Çim alan, avatar clothes, Spark, and Rock are explicitly excluded from car-facing browse/actions; verify the `study-phone-only` checklist item stays green.
- The publish audit checks media browser service, automotive descriptor, voice search, and release keep rules.
- Real approval still needs Android Auto and Automotive OS review on Google Play and a real head unit or emulator pass.

## Adaptive, Foldable, Tablet, ChromeOS, XR

- MainActivity is explicitly resizable and no longer orientation-locked.
- Core screens should render in split, wide, and future desktop-style Android windows.
- XR prep is layout safety only: no full XR app is claimed, but screens should avoid fixed-phone assumptions that break large displays.

## Android 16 Readiness

The readiness layer and audit cover:

- predictive back ownership
- edge-to-edge layout readiness
- 16 KB page compatibility as a release verification item
- startup diagnostics as a QA item
- notification compatibility across permission states and fallback surfaces

## Android 16 QPR Beta Readiness

- Developer verification / install flow: ready for release-owner validation; documented as a Play/Android Studio verification item.
- SMS OTP protection: not applicable. RadioTEDU does not read SMS OTPs and does not depend on SMS Retriever or User Consent APIs.
- Custom app icon shapes: launcher and round launcher icons exist across density buckets, including dark system variants; preview icon masks remain a device/emulator QA item.
- ART/GC and performance changes: startup, playback start, car browse loading, queue rebuild, and notification registration are covered as audit/test scenarios. Runtime code avoids preview-only API calls without gating.

## Android 17 Beta Readiness

- Android 17 beta removes the Android 16 opt-out path for large-screen orientation, resizability and aspect ratio restrictions on large screens. RadioTEDU keeps `MainActivity` resizable and avoids manifest orientation locks.
- Tablet, foldable, ChromeOS, desktop-windowing, and XR-safe 2D panel behavior are tracked by the adaptive readiness resolver.
- Background audio hardening is routed through MediaSession, media notification, foreground service media playback, Bluetooth/headset controls, and Android Auto MediaBrowserService.
- Image/audio/cache memory pressure remains a QA item; current code favors lightweight metadata, bounded recent lists, and OS-owned media surfaces.

## Google Maps Media Controls

- Google Maps playback is supported through Android's standard media route: MediaSession + MediaBrowserService + notification controls + Assistant/Gemini voice actions.
- RadioTEDU does not claim a Google Maps SDK integration. Maps surfacing is ready, requires Google validation / real device validation.
- Supported commands include "Play Radio TEDU", "Radio TEDU cal", "Play latest podcast", "son podcasti cal", "Spark cal", and "Rock cal" through the same media-session search path used by Android Auto and Assistant.

## Backend Connectivity Proof

- Mobile backend contracts are tested for next-song voting, notification token/preference APIs, Study/Pomodoro session APIs, avatar/study-room APIs, leaderboard browse data, and jukebox listen-only car data.
- The release audit requires these backend connectivity tests to exist before the Android readiness summary can pass.

## Not Applicable Android Beta Features

- SMS OTP protection: not applicable because RadioTEDU does not read OTP SMS messages.
- camera/video/pro codec beta features: not applicable beyond existing avatar/image picker use; RadioTEDU is an audio/media app and does not capture pro video.
- APV/pro video, camera night mode, UltraHDR capture, and motion photo capture: not applicable to the app's radio/podcast/jukebox scope.
- Full immersive XR mode: not claimed. The target is XR-safe 2D panel behavior.

## Modern Audio Practices

RadioTEDU should preserve system-level audio behavior:

- High-quality streams remain the preferred source when configured.
- MediaSession metadata powers lock screen, notification, headset, Bluetooth, and car controls.
- Bluetooth and wireless headphone controls route through Track Player remote events.
- Dolby/spatial-audio devices are treated as safe output routes; the app should not downmix or force a route unless the OS requests it.
- Loudness metadata and normalization are release QA checks for podcast/radio production assets.

## Release Audit

Run from `mobile/`:

```bash
npm run audit:android
```

The audit checks SDK level, app id, version declarations, notification/media permissions, Android Auto declarations, voice search, adaptive resize support, Live Updates fallback documentation, Android 16 checks, modern audio practices, ProGuard media keep rules, and release checklist coverage.

## Store Notes

- Current phone publishing target is API 35.
- Android Auto review still requires Google Play car quality review and real device/head-unit testing.
- Real FCM delivery requires Firebase project setup and valid service credentials on the backend.
- `google-services.json`, keystore files, Play Console data safety entries, screenshots, and privacy/KVKK URLs remain release-owner inputs.
