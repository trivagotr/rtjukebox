# Jukebox in the Mobile App — Analysis & Plan

Question: can the app be used **fully as the Jukebox controller, including QR**?
Short answer: **the controller already works; the only real gap is in-app QR
scanning** (today you scan with the phone's system camera, not inside the app).

---

## 1. What already works (it IS a Jukebox controller)

`src/screens/jukebox/JukeboxScreen.tsx` (+ `services/jukeboxContract.ts`) already
implements a full controller:

| Capability | How |
| ---------- | --- |
| Connect to a device/session | `POST /jukebox/connect { device_code }`; list via `GET /jukebox/devices` |
| Live queue (real-time) | `socket.io` → `join_device`, `queue_updated`, `song_skipped` |
| Search catalog | `GET /jukebox/songs?search=` |
| Add to queue | `POST /jukebox/queue` (Spotify uri or song_id via `jukeboxContract`) |
| Vote / downvote / **supervote** | `POST /jukebox/vote`; daily supervote limit logic |
| Guest requests | guest submit flow + fingerprint |
| Now-playing hero + queue UI | with per-item vote controls |
| Re-join convenience | persists `last_jukebox_code`, auto-selects, device-selector modal |
| Deep link | `radiotedu://jukebox/:deviceCode` → auto-connects (manifest intent-filter present) |

So search, add, vote, supervote, live updates, guest mode — **done**.

## 2. The gap: how you "join" today

Joining a session resolves a `device_code`, sourced from (in order):
1. **Deep link** `radiotedu://jukebox/<code>` — i.e. you scan the kiosk QR with
   the **phone's system camera**, which opens the app at that device.
2. Last used code (AsyncStorage).
3. Auto-select first device from `GET /jukebox/devices`.
4. Manual **device-selector modal**.

**There is no in-app QR scanner.** Confirmed: no camera/QR/barcode library in
`package.json` (only `react-native-image-picker`, for avatars). "Scan the QR"
currently means leaving the app and using the OS camera.

## 3. What's needed for "scan QR inside the app"

1. **A camera QR scanner** (native module + rebuild).
2. **Camera permission** runtime flow (the `CAMERA` permission is *already* in
   AndroidManifest; iOS needs `NSCameraUsageDescription`).
3. **QR payload parsing** — the kiosk QR may encode `radiotedu://jukebox/<code>`,
   `https://radiotedu.com/jukebox/<code>`, or a raw code; extract `<code>` and
   call the existing `connectToDevice`.
4. *(Optional)* **Android App Links / iOS Associated Domains** for
   `https://radiotedu.com/jukebox/*` so even system-camera scans of the https
   URL open the app (today only the `radiotedu://` scheme is registered with the
   OS; the https prefixes exist only in the react-navigation `linking` config,
   which the OS doesn't use to route intents).

## 4. Recommended plan

**Library:** `react-native-vision-camera` v4 + its `useCodeScanner` (modern,
maintained, supports `qr`). Alternative: `react-native-camera-kit` (lighter).
Recommend vision-camera.

**Milestones:**
1. Add vision-camera; iOS `NSCameraUsageDescription`; confirm Android `CAMERA`.
2. `src/screens/jukebox/ScanJukeboxScreen.tsx` — camera preview + QR detection,
   permission gate, manual "enter code" fallback.
3. `parseJukeboxCode(payload)` helper in `jukeboxContract.ts` — accept deep link,
   https URL, or raw code → returns `device_code`.
4. On scan → reuse existing `connect` flow → navigate to `Jukebox` connected.
5. Add a **"Scan QR"** button to the Jukebox empty state / device selector.
6. *(Optional)* Android App Links (`https` intent-filter + `assetlinks.json`
   hosted at `radiotedu.com/.well-known/`) + iOS Associated Domains.
7. i18n all strings (6 languages); native rebuild + verify on device.

**Effort:** small–medium. The hard part (sessions, live queue, voting) already
exists; this is one screen + a parser + a permission flow + a native dep.

## 5. Open questions
- What exactly does the kiosk QR encode today — `radiotedu://jukebox/<code>`, an
  https URL, or a raw code? (Decides the parser + whether App Links are worth it.)
- Should scanning also work from the system camera via https App Links, or is the
  in-app scanner enough?
- vision-camera vs camera-kit preference?
