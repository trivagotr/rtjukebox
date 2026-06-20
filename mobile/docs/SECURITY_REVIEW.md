# Security Review — RadioTEDU Mobile

Scope: full app (native config, networking, auth, storage, deep links, external
content, secrets). Below is every finding, severity, and whether it was fixed
here or is a recommendation requiring your action.

## ✅ Fixed in this pass

| # | Severity | Finding | Fix |
| - | -------- | ------- | --- |
| 1 | **High** | `android:usesCleartextTraffic="true"` allowed unencrypted HTTP app-wide (MITM risk). | Removed; added `res/xml/network_security_config.xml` that **blocks cleartext** except `localhost`/`127.0.0.1`/`10.0.2.2` (dev only). All prod endpoints are HTTPS. |
| 2 | **Medium** | `Linking.openURL()` opened **feed-controlled** podcast URLs — a malicious RSS feed could supply `javascript:`/`file:`/`intent:` schemes. | `PodcastScreen` now opens only `http(s)` URLs; others are blocked with a warning. |
| 3 | **Medium** | **Release builds were signed with the public debug key** (`signingConfig signingConfigs.debug` in release). Debug-signed APKs are not production-safe. | `build.gradle` now uses a real release keystore from a **gitignored** `keystore.properties` when present; falls back to debug only for local dev. |
| 4 | **Low** | Broad legacy storage permissions (`READ/WRITE_EXTERNAL_STORAGE`) granted on all Android versions. | Scoped with `maxSdkVersion` (READ ≤32, WRITE ≤29); not requested on modern Android. |

## ⚠️ Recommendations (need your action / a follow-up change)

| # | Severity | Finding | Recommended fix |
| - | -------- | ------- | --------------- |
| 5 | **Medium/High** | **Auth tokens stored in `AsyncStorage` (plaintext)** (`access_token`/`refresh_token` in `AuthContext`). AsyncStorage is unencrypted; readable on a rooted/compromised device or via backup tooling. Not changed automatically (touches the auth flow + needs a native dep + rebuild + testing). | Migrate token storage to **`react-native-keychain`** (Android Keystore / iOS Keychain). Keep only tokens there; leave non-sensitive prefs in AsyncStorage. |
| 6 | **Info** | **Provide a real release keystore.** Create one and add `android/keystore.properties` (gitignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. | `keytool -genkeypair -v -keystore radiotedu-release.jks -alias radiotedu -keyalg RSA -keysize 2048 -validity 10000` |
| 7 | **Info** | **GA4 `api_secret` will ship in the client** (`config.ts`). GA4 Measurement Protocol secrets are low-risk (write-only to your property, no read), but treat as semi-public. Do **not** put higher-privilege Google keys in the app. | Acceptable for GA4 MP. For stricter setups, proxy events through your backend. |
| 8 | **Low** | `usesCleartextTraffic` for dev relies on the loopback exception — ensure no production traffic ever uses HTTP. | Keep all `radiotedu.com` traffic on HTTPS (already the case). |

## Checked and found OK

- **No hardcoded secrets/API keys/passwords** in `src/` (only empty GA4 placeholders).
- **No `WebView`, `eval`, `Function()`, or `dangerouslySetInnerHTML`** — no JS injection surface.
- **No non-TLS URLs** in code except the documented dev loopback.
- `android:allowBackup="false"` — app data excluded from device backups. ✅
- Exported components (`MainActivity`, RNTP `MusicService`) are exported for
  legitimate reasons (launcher, Android Auto) with appropriate intent-filters.
- Auth header handling (`api.ts` interceptor + `axios` default) is standard Bearer.
- `debug.keystore` committed is the **standard public RN debug key** — expected, not a secret.
- Deep link `radiotedu://jukebox/<code>` passes only a device code to the server,
  which validates it; low risk.

## Suggested next steps (in priority order)
1. Implement #5 (Keychain token storage).
2. Create the release keystore (#6) before any production build.
3. When wiring GA4, keep the api_secret scope minimal (#7).
