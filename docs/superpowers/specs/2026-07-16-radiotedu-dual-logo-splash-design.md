# RadioTEDU + RTAI Dual-Logo Splash Design

## Objective

Show both the RadioTEDU and RTAI brands whenever the mobile application opens, without recoloring, regenerating, distorting, or obscuring either supplied logo. Commit both original PNG files to the mobile source and publish them with the new private `akgularda/radiotedumobile` repository.

## Approved Visual Design

The splash uses a full-screen near-black background matching the existing RadioTEDU mobile theme. The original white-and-red RadioTEDU wordmark appears first. The original black-and-red RTAI wordmark appears below it inside a warm-white rounded card with internal padding and a subtle border or shadow. This card supplies contrast for the black `RTAI` lettering while preserving the adjacent red radio mark exactly.

Both supplied images have transparent RGBA backgrounds. They remain separate source assets and are rendered with `resizeMode="contain"`, preserving aspect ratio at every phone width. The design does not generate a new logo, invert colors, recolor black text, modify either red mark, or bake the two logos into a lossy combined raster.

## Source Assets

- Input RadioTEDU logo: `C:/Users/akgul/Downloads/rtjukebox/logo-03byz-scaled.png`, 2560 × 463 RGBA.
- Input RTAI logo: `C:/Users/akgul/Downloads/rtai.png`, 858 × 291 RGBA.
- Mobile RadioTEDU asset: `mobile/src/assets/images/logo-radiotedu-splash.png`.
- Mobile RTAI asset: `mobile/src/assets/images/logo-rtai-splash.png`.
- Archival brand copies: `mobile/logos/logo-radiotedu-splash.png` and `mobile/logos/logo-rtai-splash.png`.

The copies must be byte-for-byte identical to their respective inputs. SHA-256 checks in the splash tests protect both assets from unintended modification.

## Startup Architecture

`mobile/src/screens/SplashScreen.tsx` remains the single responsive splash presentation component. It renders both assets, the RTAI contrast card, safe-area-aware spacing, and the existing fade/scale transition. No image-generation dependency or runtime network request is introduced.

`mobile/App.tsx` starts with the splash visible on every cold application process launch. The splash overlays startup initialization, including saved-language initialization and consent-state loading, so the user does not see the existing blank provider frame or loading spinner first. It stays visible for a minimum of approximately 1.5 seconds and exits only after required startup state is ready, with a bounded safety timeout preventing a permanent overlay if initialization fails.

The navigation tree, consent screen, authentication storage, radio playback bootstrap, Study, Voting, Jukebox, and Android Auto behavior continue loading underneath or immediately after the overlay. The splash does not become a navigation route and cannot reappear during ordinary tab or WebView navigation.

## Native Handoff

Android keeps a near-black launch/window background so the operating-system preview hands off into the React Native splash without a white flash. The implementation must remain compatible with current Android startup and Android Auto service declarations; it must not add a launcher activity that interferes with media browsing or deep links.

iOS `LaunchScreen.storyboard` uses the same near-black background rather than the current white/template launch content. The first responsive React Native frame then displays the approved two-logo composition. Native launch screens remain static and lightweight; the full paired layout, timing, and animation live in the shared React Native component.

## Responsive and Accessibility Behavior

- The content is centered vertically within safe bounds and scales for narrow portrait phones without clipping.
- The RadioTEDU wordmark uses no more than roughly 78% of available width.
- The RTAI card uses no more than roughly 64% of available width, with enough warm-white padding to separate the black letters from the dark screen.
- A compact vertical gap maintains hierarchy between RadioTEDU and RTAI.
- `accessibilityRole="image"` and distinct labels identify “RadioTEDU” and “RTAI” without adding visible copy.
- Reduced-height devices shrink both marks and spacing rather than cropping them.

## Tests and Verification

Focused Jest/source tests must verify that:

1. `App` initializes the splash as visible and does not place it behind the consent gate.
2. `SplashScreen` references both exact mobile assets.
3. The RTAI image is inside a light contrast-card style while the page background remains near-black.
4. Both images use containment sizing and accessibility labels.
5. The minimum display and safety timeout are bounded and timers clean up on unmount.
6. The original and copied asset SHA-256 hashes match.
7. Android startup keeps a dark preview and existing Android Auto declarations/tests continue to pass.
8. iOS no longer displays the React Native template launch copy or a white background.

Run focused splash/bootstrap tests, the complete mobile Jest suite, TypeScript checking, error-only ESLint, Study packaging, Android publishing audit, and an Android debug APK build. Inspect screenshots at representative narrow and tall phone sizes before publishing.

## Repository and Release Integration

The splash implementation is committed first to `codex/study-game-oss`, then exported with the complete mobile and Study trees into the fresh private `akgularda/radiotedumobile` repository. Both logo inputs and their consuming code are tracked in Git history. Generated build output, signing credentials, environment files, backend, kiosk, voting agent, WordPress data, and unrelated source-repository content remain excluded.

The new private repository CI runs the splash tests with all other mobile checks. The initial QA APK published there must contain the dual-logo splash and must be rebuilt after this change; the older pre-splash APK must not be presented as the final artifact.

## Safety

This feature does not alter the RadioTEDU or RTAI logo artwork, production APIs, radiotedu.com files, WordPress pages, accounts, Music PC configuration, radio streams, or application secrets. It adds only mobile startup presentation, source assets, tests, and documentation.
