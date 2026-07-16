# RadioTEDU + RTAI Dual-Logo Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the unchanged RadioTEDU and RTAI logos on every mobile cold start, document the behavior in README, verify it, and produce a fresh APK that can be exported to the private mobile repository.

**Architecture:** Keep the supplied PNGs as immutable assets and compose them responsively in the existing React Native `SplashScreen`. Move the splash overlay ahead of language/consent readiness, gate dismissal on minimum time plus startup readiness, retain a bounded safety exit, and keep native Android/iOS handoff surfaces near-black to avoid a white flash.

**Tech Stack:** React Native 0.76.9, TypeScript 5.0.4, Jest 29, Android XML/Gradle, iOS storyboard, Node.js 20.

## Global Constraints

- Preserve the RadioTEDU input SHA-256 `7B621E98364564A8DF162F0D49BED25EC66918A23629F74A96E1E991B599DF26` exactly.
- Preserve the RTAI input SHA-256 `194C1771AD3905E8DC3D4601D0F6701341BDE7BE9D9A43BCB8C44DA4D246E03F` exactly.
- Do not regenerate, recolor, invert, crop, distort, or merge either logo into a lossy raster.
- Use a near-black page and a warm-white rounded contrast card for the original black RTAI lettering; preserve both red radio marks.
- Show the splash on every cold application process launch, for at least 1,500 ms, until language and consent state are ready, with a 5,000 ms safety timeout.
- Do not turn the splash into a navigation route or show it during ordinary tab/WebView navigation.
- Preserve authentication storage, consent semantics, navigation, radio playback, podcasts, Study, Voting, Jukebox, Android Auto, deep links, and unrelated behavior.
- Do not modify production APIs, radiotedu.com, WordPress, accounts, Music PC configuration, radio streams, or secrets.
- Commit both original assets and README documentation to `codex/study-game-oss`, then include them in the private `akgularda/radiotedumobile` export.

---

### Task 1: Add Immutable Brand Assets and Failing Splash Contracts

**Files:**
- Create: `mobile/src/assets/images/logo-radiotedu-splash.png`
- Create: `mobile/src/assets/images/logo-rtai-splash.png`
- Create: `mobile/logos/logo-radiotedu-splash.png`
- Create: `mobile/logos/logo-rtai-splash.png`
- Create: `mobile/__tests__/dualLogoSplashSource.test.ts`

**Interfaces:**
- Consumes: the two user-supplied RGBA PNG files and existing source files.
- Produces: four byte-identical tracked copies and a focused Jest contract that later tasks satisfy.

- [ ] **Step 1: Copy the exact input files without image processing**

Run from the source worktree:

```powershell
Copy-Item -LiteralPath 'C:\Users\akgul\Downloads\rtjukebox\logo-03byz-scaled.png' -Destination 'mobile\src\assets\images\logo-radiotedu-splash.png'
Copy-Item -LiteralPath 'C:\Users\akgul\Downloads\rtai.png' -Destination 'mobile\src\assets\images\logo-rtai-splash.png'
Copy-Item -LiteralPath 'C:\Users\akgul\Downloads\rtjukebox\logo-03byz-scaled.png' -Destination 'mobile\logos\logo-radiotedu-splash.png'
Copy-Item -LiteralPath 'C:\Users\akgul\Downloads\rtai.png' -Destination 'mobile\logos\logo-rtai-splash.png'
```

- [ ] **Step 2: Write the failing focused source and asset test**

Create `mobile/__tests__/dualLogoSplashSource.test.ts` with helpers based on `fs.readFileSync`, `path.join`, and `crypto.createHash('sha256')`. Assert all of the following exact contracts:

```typescript
expect(hash('src/assets/images/logo-radiotedu-splash.png')).toBe(
  '7B621E98364564A8DF162F0D49BED25EC66918A23629F74A96E1E991B599DF26',
);
expect(hash('src/assets/images/logo-rtai-splash.png')).toBe(
  '194C1771AD3905E8DC3D4601D0F6701341BDE7BE9D9A43BCB8C44DA4D246E03F',
);
expect(hash('logos/logo-radiotedu-splash.png')).toBe(hash('src/assets/images/logo-radiotedu-splash.png'));
expect(hash('logos/logo-rtai-splash.png')).toBe(hash('src/assets/images/logo-rtai-splash.png'));
expect(splashSource).toContain("require('../assets/images/logo-radiotedu-splash.png')");
expect(splashSource).toContain("require('../assets/images/logo-rtai-splash.png')");
expect(splashSource).toContain('accessibilityLabel="RadioTEDU"');
expect(splashSource).toContain('accessibilityLabel="RTAI"');
expect(splashSource).toContain('resizeMode="contain"');
expect(splashSource).toContain("backgroundColor: '#F7F3EA'");
expect(splashSource).toContain('export const SPLASH_MIN_VISIBLE_MS = 1500');
expect(splashSource).toContain('export const SPLASH_SAFETY_TIMEOUT_MS = 5000');
expect(appSource).toContain('React.useState(true)');
expect(appSource).toContain('ready={i18nReady && ready}');
expect(stylesSource).toContain('<item name="android:windowDisablePreview">true</item>');
expect(stylesSource).toContain('<item name="android:windowBackground">@color/startup_background</item>');
expect(colorsSource).toContain('<color name="startup_background">#070707</color>');
expect(storyboardSource).not.toContain('Powered by React Native');
expect(storyboardSource).not.toContain('systemBackgroundColor');
```

- [ ] **Step 3: Run the focused test to verify the expected source-contract failure**

Run:

```powershell
npm --prefix mobile test -- --runInBand __tests__/dualLogoSplashSource.test.ts
```

Expected: FAIL on missing dual-logo source references and native dark-handoff contracts; asset hash assertions already pass.

- [ ] **Step 4: Commit the assets and failing contract**

Run:

```powershell
git add mobile/src/assets/images/logo-radiotedu-splash.png mobile/src/assets/images/logo-rtai-splash.png mobile/logos/logo-radiotedu-splash.png mobile/logos/logo-rtai-splash.png mobile/__tests__/dualLogoSplashSource.test.ts
git commit -m "test: add dual-logo splash assets and contracts"
```

### Task 2: Implement Responsive Splash Presentation and Startup Readiness

**Files:**
- Modify: `mobile/src/screens/SplashScreen.tsx`
- Modify: `mobile/App.tsx`
- Test: `mobile/__tests__/dualLogoSplashSource.test.ts`
- Test: `mobile/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: `ready: boolean` plus `onFinish: () => void`.
- Produces: `SplashScreen`, `SPLASH_MIN_VISIBLE_MS`, and `SPLASH_SAFETY_TIMEOUT_MS`; calls `onFinish` once after readiness/minimum-time exit or safety timeout.

- [ ] **Step 1: Replace the single-logo timing contract with explicit startup props and constants**

In `SplashScreen.tsx`, define:

```typescript
export const SPLASH_MIN_VISIBLE_MS = 1500;
export const SPLASH_SAFETY_TIMEOUT_MS = 5000;

interface SplashScreenProps {
  ready: boolean;
  onFinish: () => void;
}
```

Track safe-area/layout readiness separately from `minimumElapsed`. Start one minimum timer and one safety timer, clear both on unmount, and guard `onFinish` with a ref so it fires at most once. Begin the exit animation only when `layoutReady && minimumElapsed && ready`.

- [ ] **Step 2: Render the approved two-logo responsive composition**

Use a near-black `#070707` full-screen `Animated.View`. Render one `Animated.View` brand stack containing:

```tsx
<Image
  source={require('../assets/images/logo-radiotedu-splash.png')}
  style={styles.radioTeduLogo}
  resizeMode="contain"
  accessibilityRole="image"
  accessibilityLabel="RadioTEDU"
/>
<View style={styles.rtaiCard}>
  <Image
    source={require('../assets/images/logo-rtai-splash.png')}
    style={styles.rtaiLogo}
    resizeMode="contain"
    accessibilityRole="image"
    accessibilityLabel="RTAI"
  />
</View>
```

Set the brand stack width to `Math.min(width * 0.78, 520)`, shrink spacing for heights below 640, use RadioTEDU aspect ratio `2560 / 463`, RTAI aspect ratio `858 / 291`, and style the card with `backgroundColor: '#F7F3EA'`, rounded corners, internal padding, and a subtle translucent white border/shadow. Fade/scale the complete stack as one unit; do not translate either logo into the application header.

- [ ] **Step 3: Put the overlay ahead of initialization and consent readiness**

In `App.tsx`, initialize `showSplash` with `React.useState(true)` and remove the early `if (!i18nReady) return <SafeAreaProvider />` blank frame. Keep all providers mounted. Extend `ConsentGate` with `i18nReady`, calculate the existing base content for consent-not-ready, consent-required, or navigation, and return:

```tsx
<>
  {content}
  {showSplash && (
    <SplashScreen
      ready={i18nReady && ready}
      onFinish={onSplashFinish}
    />
  )}
</>
```

The overlay remains outside the consent-decision branches and disappears permanently for the current process after `onSplashFinish` sets `showSplash` false.

- [ ] **Step 4: Run focused and application rendering tests**

Run:

```powershell
npm --prefix mobile test -- --runInBand __tests__/dualLogoSplashSource.test.ts __tests__/App.test.tsx
```

Expected: PASS; no open timer or unmounted-state warnings.

- [ ] **Step 5: Commit responsive startup behavior**

Run:

```powershell
git add mobile/src/screens/SplashScreen.tsx mobile/App.tsx
git commit -m "feat: show RadioTEDU and RTAI on startup"
```

### Task 3: Add Dark Native Handoff and README Documentation

**Files:**
- Create: `mobile/android/app/src/main/res/values/colors.xml`
- Modify: `mobile/android/app/src/main/res/values/styles.xml`
- Modify: `mobile/ios/RadioTEDUMobile/LaunchScreen.storyboard`
- Modify: `mobile/README.md`
- Modify: `mobile/__tests__/androidThemeSource.test.ts`
- Test: `mobile/__tests__/dualLogoSplashSource.test.ts`

**Interfaces:**
- Consumes: the shared `#070707` startup color and approved splash behavior.
- Produces: flash-free native handoff, preserved Android preview hardening, and setup/branding documentation.

- [ ] **Step 1: Add the Android startup color without undoing the black-screen fix**

Create `colors.xml` containing `startup_background` with `#070707`. Add `<item name="android:windowBackground">@color/startup_background</item>` to `AppTheme` while retaining all three existing hardening properties, especially `<item name="android:windowDisablePreview">true</item>`.

- [ ] **Step 2: Update Android theme tests before editing the theme**

Extend `androidThemeSource.test.ts` to load `colors.xml`, assert the dark background item and exact color, and retain its assertions for disabled preview, non-translucent, and non-floating startup. Run this file once before the XML edit to observe the missing-background failure, then run it again after the edit and expect PASS.

- [ ] **Step 3: Replace iOS template launch copy with a static dark handoff**

In `LaunchScreen.storyboard`, remove both template labels and their constraints, set the root view background to an explicit calibrated RGB color equivalent to `#070707`, and keep a valid full-screen launch view controller. Do not add animation, network content, or startup logic to the storyboard.

- [ ] **Step 4: Add a README section**

Add `## Startup branding` to `mobile/README.md`. Document the RadioTEDU-over-RTAI layout, the unmodified original assets and hashes, the warm-white contrast-card reason, every-cold-launch timing/readiness behavior, source paths, native dark handoff, and the command:

```powershell
npm test -- --runInBand __tests__/dualLogoSplashSource.test.ts __tests__/androidThemeSource.test.ts __tests__/App.test.tsx
```

State that both original assets are tracked and will be included in the private `akgularda/radiotedumobile` repository.

- [ ] **Step 5: Run focused contracts and commit**

Run:

```powershell
npm --prefix mobile test -- --runInBand __tests__/dualLogoSplashSource.test.ts __tests__/androidThemeSource.test.ts __tests__/App.test.tsx
git add mobile/android/app/src/main/res/values/colors.xml mobile/android/app/src/main/res/values/styles.xml mobile/ios/RadioTEDUMobile/LaunchScreen.storyboard mobile/README.md mobile/__tests__/androidThemeSource.test.ts
git commit -m "docs: document dual-logo startup branding"
```

Expected: focused tests pass and the commit contains only native handoff, README, and related test changes.

### Task 4: Verify the Complete Mobile App and Build the New APK

**Files:**
- Modify: none unless an in-scope verification defect is found.
- Create locally: `RadioTEDU-Mobile-<commit>-release.apk` outside Git tracking.

**Interfaces:**
- Consumes: complete dual-logo implementation.
- Produces: verified mobile source commit and a newly built QA APK containing both logos.

- [ ] **Step 1: Run all focused and full JavaScript checks**

Run:

```powershell
npm --prefix mobile test -- --runInBand __tests__/dualLogoSplashSource.test.ts __tests__/androidThemeSource.test.ts __tests__/App.test.tsx
npm --prefix mobile test -- --runInBand
npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json
npx --prefix mobile eslint mobile --quiet
npm --prefix mobile run package:study
npm --prefix mobile run audit:android
```

Expected: all commands exit 0; ESLint reports no errors.

- [ ] **Step 2: Build the Android release variant**

Run:

```powershell
& 'mobile\android\gradlew.bat' -p mobile\android clean assembleRelease --no-daemon
```

Expected: `BUILD SUCCESSFUL` and exactly one release APK under `mobile/android/app/build/outputs/apk/release/`.

- [ ] **Step 3: Verify APK contents and signature status**

Confirm both `logo-radiotedu-splash.png` and `logo-rtai-splash.png` are present in the packaged React Native bundle/resources, run `apksigner verify --verbose --print-certs`, and record whether the build used the known development debug key or a production key. Do not call a debug-signed artifact production-signed.

- [ ] **Step 4: Copy and hash the final QA APK**

Use the short source commit in the filename, copy the APK to `C:\Users\akgul\Downloads\rtjukebox\RadioTEDU-Mobile-<commit>-release.apk`, and calculate SHA-256 with `Get-FileHash`.

- [ ] **Step 5: Push the verified source branch**

Run:

```powershell
git status --short
git push origin codex/study-game-oss
```

Expected: only known unrelated user files remain uncommitted; all splash commits are present on the remote branch.

### Task 5: Update the Standalone Export Plan to the Verified Splash Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-radiotedumobile-standalone-repository.md`
- Modify: `docs/superpowers/specs/2026-07-16-radiotedumobile-standalone-repository-design.md`

**Interfaces:**
- Consumes: the final verified dual-logo source commit.
- Produces: an exact export contract that cannot accidentally select the older pre-splash APK or source tree.

- [ ] **Step 1: Replace the old export commit everywhere**

Replace `9939237b`/the older full source hash with the final verified splash commit, including its full 40-character hash where the design records provenance.

- [ ] **Step 2: Add splash and README export requirements**

Require both source and archival logo paths, `dualLogoSplashSource.test.ts`, the native dark handoff files, the README startup-branding section, and the newly built APK hash. State explicitly that the prior `bf6ea0b0` APK must not be published as the final release.

- [ ] **Step 3: Self-review and commit the updated export contract**

Scan both files for the old source commit, old APK hash, placeholders, and contradictions. Commit with:

```powershell
git add docs/superpowers/plans/2026-07-16-radiotedumobile-standalone-repository.md docs/superpowers/specs/2026-07-16-radiotedumobile-standalone-repository-design.md
git commit -m "docs: export verified dual-logo mobile build"
git push origin codex/study-game-oss
```

Expected: the standalone repository workflow now exports the verified splash commit and publishes only the newly built APK.

