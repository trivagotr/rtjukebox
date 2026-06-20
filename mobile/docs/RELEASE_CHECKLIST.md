# RadioTEDU — Release & Compliance Checklist

Production readiness for a real university radio (TED University). Every item is
tagged: **[done]**, **[code]** (I can implement in this repo), or **[you]**
(needs a human / account / asset I can't provide).

---

## 1. Google Play — policy & store listing

- **[you]** Google Play Developer account (a **TED University org account** is
  recommended over a personal one; D-U-N-S may be required for org verification).
- **[you]** **Privacy Policy URL** hosted at `https://radiotedu.com/privacy`
  (the in-app consent + Data&Privacy screens link here). Must describe the
  anonymized analytics + demographics. See `docs/PRIVACY_DATA_PLAN.md`.
- **[you]** **Data safety form** (Play Console): declare what we collect. Source
  of truth = `PRIVACY_DATA_PLAN.md`. We collect (only on consent): app activity
  (listening time), app info, optional coarse demographics; **no** name/email/
  precise location/ads ID. Mark data as *not* sold, encrypted in transit,
  deletable on request.
- **[you]** **Content rating** questionnaire (IARC) — likely "Everyone".
- **[you]** Store listing assets: 512×512 icon, feature graphic (1024×500),
  phone + (if Auto) car screenshots, short/full description (localize to the
  6 app languages).
- **[code/done]** **Target API level**: targetSdk 34 (meets current Play
  requirement). Re-check each year (Play raises the floor ~annually).
- **[code/done]** **Permissions minimized & justified** (see `SECURITY_REVIEW.md`):
  CAMERA (avatar), media playback foreground service, notifications, scoped
  storage. Provide a **prominent-disclosure** justification for the foreground
  media service in the Play listing.
- **[you]** **Account deletion**: Play requires an in-app + web path to delete
  account/data. In-app exists (Profile → Data & Privacy → withdraw/delete).
  Add a **web deletion page** (`radiotedu.com/delete-account`).

## 2. Android Auto / Automotive OS — quality

- **[done]** Custom `MediaBrowserService` (RNTP v4 has none) + MediaSession.
- **[done]** Driver-safe design: ≤2-tap depth, flat lists, large targets,
  Jukebox is **listen-only** (no QR/add/vote), dark template.
- **[done]** **Automotive build flavor** (`required="true"`) so AAOS lists the
  app (fixes the "non media template app" opt-in).
- **[code]** **Content style hints** set (grid root / list children) — verify
  rendering on the head unit.
- **[you]** Square ≥512 px artwork per channel + a Classic-specific asset
  (current logos are landscape; see `ANDROID_AUTO.md`).
- **[you]** **`JUKEBOX_STREAM_URL`** for the communal listen-only stream; **GA4**
  creds — both empty placeholders in `config.ts` today.
- **[you]** **Distraction-optimized review**: Google manually reviews car apps;
  follow the Android for Cars **Quality** guidelines before submitting.
- **[you]** **CarPlay** (iOS) needs Apple's CarPlay-audio **entitlement**
  (request from Apple) — separate track.

## 3. Privacy — KVKK (Law 6698) & GDPR

- **[done]** First-launch **consent gate**, granular (analytics + optional
  demographics), default-off, versioned; withdraw/delete in Profile.
- **[done]** Pseudonymous rotatable install id; no PII; GA4 consent-gated.
- **[you]** **Aydınlatma Metni** + **Açık Rıza Metni** (KVKK) + Privacy Policy,
  hosted & localized. Name the **data controller** (TED University entity) +
  KVKK contact e-mail.
- **[you]** If any users are **under 18** (university prep/younger), confirm
  parental-consent handling.
- **[done]** Data minimization, retention plan documented (`PRIVACY_DATA_PLAN`).

## 4. Security & release build

- **[done]** Network security config (no cleartext except dev loopback),
  http(s)-only deep links, scoped storage (`SECURITY_REVIEW.md`).
- **[code]** Release signing reads gitignored `keystore.properties`.
- **[you]** Generate the **real release keystore**; enroll in **Play App
  Signing**. Keep the upload key safe.
- **[code]** **ProGuard/R8** rules for release (keep RNTP, vector-icons,
  reanimated-free here, socket.io) — verify a release build runs.
- **[you]** **Move auth tokens to `react-native-keychain`** (recommended in
  `SECURITY_REVIEW.md`) before public launch.

## 5. Quality, accessibility, reliability

- **[code]** Run `tsc`, `npm run lint`, `npm test` clean in CI.
- **[you/code]** Add **CI** (GitHub Actions): typecheck + lint + test + assemble
  on PR. (I can scaffold the workflow.)
- **[code]** Accessibility: ensure `accessibilityLabel`/roles on interactive
  controls; respect dynamic font scale (already using `maxFontSizeMultiplier`).
- **[done]** i18n in 6 languages incl. Arabic **RTL**.
- **[you]** Crash/ANR monitoring (Play Console vitals; optionally Firebase
  Crashlytics — a Google product, fits "use Google").

## 6. Branding / institutional

- **[done]** Real RadioTEDU brand logos wired in.
- **[you/done]** Open-source usage requires a visible **"RadioTEDU" credit**
  (already in README license note) — keep in app About/Splash.
- **[you]** App name/package final: `com.radiotedumobile` (consider
  `com.radiotedu.app` or a TED-University-owned package before first publish —
  the package name is permanent once published).

---

## What I will implement now (the [code] items)
1. Sensible `versionCode`/`versionName` + a release ProGuard keep-rules pass.
2. CI workflow (typecheck + lint + test + assemble).
3. Account-deletion/data links wired in-app (web pages are yours to host).
4. Verify the automotive variant renders the design on the head unit.

## What only you can do (the [you] items)
Play Console account, hosting the privacy/KVKK pages + deletion page, the
release keystore + Play App Signing, store-listing assets/screenshots, the Data
Safety + content-rating forms, square car artwork, the Jukebox stream URL + GA4
credentials, and the Android-Auto distraction-optimized review submission.
