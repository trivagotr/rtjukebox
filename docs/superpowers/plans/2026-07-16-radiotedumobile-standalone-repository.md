# RadioTEDU Mobile Standalone Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create, verify, and publish a fresh private `akgularda/radiotedumobile` repository containing the complete RadioTEDU mobile and Study sources, safe production endpoint configuration, CI, encrypted signing-secret integration, and an initial APK release.

**Architecture:** Export only the tracked `mobile/` and `study-game/` trees from approved source commit `9939237b`, then add repository-level contracts, documentation, CI, and release automation. Runtime URLs remain ordinary versioned configuration while production signing material is reconstructed only from encrypted GitHub Actions Secrets. Jukebox, Voting, and Study remain separate mobile WebView destinations, and mobile never communicates directly with the voting Music PC.

**Tech Stack:** React Native 0.76.9, TypeScript 5.0.4, Android Gradle/Java 17, Vite 8, Vitest 4, Node.js 20, GitHub Actions, GitHub CLI.

## Global Constraints

- Destination is the new private repository `akgularda/radiotedumobile` with fresh Git history.
- Export source commit `9939237b` from branch `codex/study-game-oss`.
- Commit public production URLs exactly: `https://radiotedu.com/jukebox/api/v1`, `https://radiotedu.com/study/`, `https://radiotedu.com/vote/`, and `https://radiotedu.com/juke-local/controller/`.
- Preserve radio streams, podcasts, branding, authentication storage, Android Auto metadata, navigation, and all unrelated mobile behavior.
- Jukebox, Voting, and Study remain independent; mobile must never connect directly to the voting Music PC.
- Do not include backend, kiosk, voting agent, WordPress, `node_modules`, build caches, Gradle output, emulator data, or QA recordings.
- Never commit a real token, password, private key, production keystore, account credential, or runtime user access/refresh token in plaintext.
- GitHub Actions secret names are `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
- A production release must fail when signing secrets are unavailable; it must never silently publish a debug-signed APK as production.
- Do not modify or delete radiotedu.com files, accounts, WordPress pages, Music PC configuration, production databases, or existing repositories.

---

## File Structure

- `.github/workflows/ci.yml`: runs repository contracts, Study tests/build, mobile tests/typecheck/error-only lint, Study packaging, Android audit, and debug APK smoke build.
- `.github/workflows/android-release.yml`: manually builds and verifies a production-signed APK from encrypted GitHub Secrets and publishes a private artifact/release.
- `.gitignore`: blocks dependencies, generated output, local signing properties, production keystores, environment files, logs, recordings, and emulator artifacts.
- `README.md`: standalone repository purpose, setup, endpoint map, commands, and release status.
- `docs/API_CONFIGURATION.md`: source-of-truth mapping for API, Study, Voting, Jukebox, Socket.IO, and runtime authentication.
- `docs/GITHUB_SECRETS.md`: exact encrypted signing-secret provisioning procedure without secret values.
- `docs/RELEASE.md`: local and Actions release steps, signature checks, and debug-versus-production labeling.
- `docs/SOURCE_PROVENANCE.md`: source repository, exact commit, export allowlist, and excluded subsystem list.
- `scripts/verify-repository.mjs`: deterministic repository safety and endpoint contract verifier.
- `tests/repository-contract.test.mjs`: Node test coverage for the standalone layout, endpoint contracts, forbidden directories, and ignored secret-bearing files.
- `mobile/`: exact tracked mobile tree from source commit, including Android/iOS projects, tests, Android Auto metadata, Study fallback, and development-only template debug keystore.
- `study-game/`: exact tracked Study game tree from source commit, including source, tests, room/avatar assets, and build tooling.

### Task 1: Export the Approved Mobile and Study Trees

**Files:**
- Create: `C:/Users/akgul/Downloads/radiotedumobile/mobile/**`
- Create: `C:/Users/akgul/Downloads/radiotedumobile/study-game/**`
- Create: `C:/Users/akgul/Downloads/radiotedumobile/.gitignore`
- Create: `C:/Users/akgul/Downloads/radiotedumobile/.gitattributes`

**Interfaces:**
- Consumes: tracked files at source commit `9939237b`.
- Produces: a clean local repository root containing only the two application trees and repository metadata.

- [ ] **Step 1: Verify the destination does not already exist and the approved source commit is available**

Run:

```powershell
Test-Path -LiteralPath 'C:\Users\akgul\Downloads\radiotedumobile'
git cat-file -e 9939237b^{commit}
```

Expected: `False`; `git cat-file` exits 0.

- [ ] **Step 2: Export only the approved tracked trees**

Run from the source worktree:

```powershell
New-Item -ItemType Directory -Path 'C:\Users\akgul\Downloads\radiotedumobile' | Out-Null
git archive --format=tar --output='C:\Users\akgul\Downloads\radiotedumobile-export.tar' 9939237b mobile study-game
tar -xf 'C:\Users\akgul\Downloads\radiotedumobile-export.tar' -C 'C:\Users\akgul\Downloads\radiotedumobile'
Remove-Item -LiteralPath 'C:\Users\akgul\Downloads\radiotedumobile-export.tar'
```

Expected: `mobile/package.json` and `study-game/package.json` exist; no other source-repository top-level application directory exists.

- [ ] **Step 3: Add repository ignore rules**

Create `.gitignore` with:

```gitignore
node_modules/
dist/
build/
.gradle/
mobile/android/.gradle/
mobile/android/app/build/
mobile/android/build/
mobile/ios/Pods/
*.log
*.mp4
*.webm
*.mov
*.har
.env
.env.*
!.env.example
mobile/android/keystore.properties
*.jks
*.p12
*.pem
*.key
*.keystore
!mobile/android/app/debug.keystore
.idea/
.vscode/
.DS_Store
Thumbs.db
```

Create `.gitattributes` with:

```gitattributes
* text=auto
*.sh text eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.keystore binary
```

- [ ] **Step 4: Initialize fresh history and commit the export**

Run:

```powershell
git init -b main
git add .gitignore .gitattributes mobile study-game
git commit -m "feat: import RadioTEDU mobile and Study apps"
```

Expected: one root commit on `main`; `git status --short` contains no output.

### Task 2: Add Standalone Repository Contract Tests and Verifier

**Files:**
- Create: `tests/repository-contract.test.mjs`
- Create: `scripts/verify-repository.mjs`

**Interfaces:**
- Consumes: repository root path and `mobile/src/services/config.ts`.
- Produces: `verifyRepository(root): string[]`, returning an empty array only when layout, URLs, ignores, and forbidden-content checks pass.

- [ ] **Step 1: Write the failing repository contract test**

Create `tests/repository-contract.test.mjs` using `node:test`, `node:assert/strict`, `node:fs`, and `node:path`. It must import `verifyRepository` and assert:

```javascript
assert.deepEqual(verifyRepository(repositoryRoot), []);
assert.match(configSource, /https:\/\/radiotedu\.com\/jukebox\/api\/v1/);
assert.match(configSource, /https:\/\/radiotedu\.com\/study\//);
assert.match(configSource, /https:\/\/radiotedu\.com\/vote\//);
assert.match(configSource, /https:\/\/radiotedu\.com\/juke-local\/controller\//);
```

It must also assert that `mobile/`, `study-game/`, and `mobile/android/app/src/main/res/xml/automotive_app_desc.xml` exist; `backend/`, `tools/local-voting-agent/`, `kiosk/`, and `wordpress/` do not exist; and `.gitignore` contains `mobile/android/keystore.properties`, `*.jks`, `.env.*`, and `node_modules/`.

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```powershell
node --test tests/repository-contract.test.mjs
```

Expected: FAIL because `scripts/verify-repository.mjs` does not exist.

- [ ] **Step 3: Implement the repository verifier**

Create `scripts/verify-repository.mjs` exporting `verifyRepository(root)`. The function must:

```javascript
export function verifyRepository(root) {
  const failures = [];
  const required = ['mobile/package.json', 'study-game/package.json'];
  const forbidden = ['backend', 'kiosk', 'tools/local-voting-agent', 'wordpress'];
  const urls = [
    'https://radiotedu.com/jukebox/api/v1',
    'https://radiotedu.com/study/',
    'https://radiotedu.com/vote/',
    'https://radiotedu.com/juke-local/controller/',
  ];
  // Resolve each relative path beneath root with path.join.
  // Add one descriptive failure for every missing required file,
  // present forbidden path, absent URL in mobile/src/services/config.ts,
  // or tracked-looking signing file not covered by .gitignore.
  return failures;
}
```

The CLI entrypoint must print each failure to stderr and set `process.exitCode = 1`, or print `Repository contract verified.` when no failures exist. Implement all checks directly with `existsSync()` and `readFileSync()`; do not add dependencies.

- [ ] **Step 4: Run the contract test and verifier**

Run:

```powershell
node --test tests/repository-contract.test.mjs
node scripts/verify-repository.mjs
```

Expected: both exit 0; verifier prints `Repository contract verified.`

- [ ] **Step 5: Commit the contract**

Run:

```powershell
git add tests/repository-contract.test.mjs scripts/verify-repository.mjs
git commit -m "test: enforce standalone repository contracts"
```

### Task 3: Add Repository and Configuration Documentation

**Files:**
- Create: `README.md`
- Create: `docs/API_CONFIGURATION.md`
- Create: `docs/GITHUB_SECRETS.md`
- Create: `docs/RELEASE.md`
- Create: `docs/SOURCE_PROVENANCE.md`

**Interfaces:**
- Consumes: source configuration and Android signing behavior.
- Produces: a non-secret operational contract for developers and GitHub Actions.

- [ ] **Step 1: Document setup and verification in `README.md`**

Include the repository purpose, Node 20/Java 17 prerequisites, commands `npm ci`, Study `npm test`/`npm run build`, mobile `npm test -- --runInBand`, `npx tsc --noEmit`, `npx eslint . --quiet`, `npm run package:study`, `npm run audit:android`, and `android/gradlew.bat assembleDebug`. State that the checked-in debug keystore is development-only and that production signing requires GitHub Secrets.

- [ ] **Step 2: Document the exact runtime endpoints**

In `docs/API_CONFIGURATION.md`, add this table:

| Feature | URL | Mobile behavior |
|---|---|---|
| API | `https://radiotedu.com/jukebox/api/v1` | Authenticated REST base |
| Study | `https://radiotedu.com/study/` | Remote Study WebView with packaged fallback |
| Voting | `https://radiotedu.com/vote/` | Independent voting WebView; backend-facing only |
| Jukebox | `https://radiotedu.com/juke-local/controller/` | Independent QR/controller WebView |
| Socket.IO | `https://radiotedu.com` + `/jukebox/socket.io` | Backend live voting events |

State explicitly: “Do not change the structure where the backend gets information from the Music PC when voting if that communication already works. Change only the backend/mobile-app communication. The mobile app must never connect directly to the Music PC.”

- [ ] **Step 3: Document encrypted signing-secret provisioning**

In `docs/GITHUB_SECRETS.md`, define the four exact secret names, a PowerShell base64 command using `[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))`, and `gh secret set` commands that read values from standard input. State that the workspace had no production keystore or production API credential, so no value was fabricated or migrated.

- [ ] **Step 4: Document release and provenance**

In `docs/RELEASE.md`, distinguish debug QA APKs from production-signed releases, list `apksigner verify --verbose --print-certs`, and explain the manual `workflow_dispatch` flow. In `docs/SOURCE_PROVENANCE.md`, record source repository `trivagotr/rtjukebox`, branch `codex/study-game-oss`, commit `9939237b`, the `mobile/` + `study-game/` allowlist, and all excluded subsystems/artifacts.

- [ ] **Step 5: Commit the documentation**

Run:

```powershell
git add README.md docs
git commit -m "docs: document mobile APIs secrets and releases"
```

### Task 4: Add Continuous Integration

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: both package lockfiles and Android Gradle wrapper.
- Produces: one pull-request/push check covering repository, Study, mobile, packaging, Android Auto audit, and Android debug build contracts.

- [ ] **Step 1: Create the CI workflow**

Configure `push` on `main`, `pull_request`, `permissions: contents: read`, and `concurrency` cancellation. Use Ubuntu, `actions/checkout@v4`, `actions/setup-node@v4` with Node 20 caches for both lockfiles, and `actions/setup-java@v4` with Temurin 17.

Run these commands in order:

```yaml
- run: node --test tests/repository-contract.test.mjs
- run: node scripts/verify-repository.mjs
- working-directory: study-game
  run: npm ci
- working-directory: study-game
  run: npm test
- working-directory: study-game
  run: npm run build
- working-directory: mobile
  run: npm ci
- working-directory: mobile
  run: npm test -- --runInBand
- working-directory: mobile
  run: npx tsc --noEmit
- working-directory: mobile
  run: npx eslint . --quiet
- working-directory: mobile
  run: npm run package:study
- working-directory: mobile
  run: npm run audit:android
- run: chmod +x mobile/android/gradlew
- working-directory: mobile/android
  run: ./gradlew assembleDebug --no-daemon
```

- [ ] **Step 2: Validate YAML and repository contracts locally**

Run:

```powershell
node scripts/verify-repository.mjs
git diff --check
```

Expected: verifier passes; `git diff --check` exits 0.

- [ ] **Step 3: Commit CI**

Run:

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: verify mobile Study and Android builds"
```

### Task 5: Add Production-Signed Android Release Automation

**Files:**
- Create: `.github/workflows/android-release.yml`

**Interfaces:**
- Consumes: four encrypted repository secrets and a manually supplied release tag.
- Produces: a signature-verified `app-release.apk` artifact and private GitHub Release; no production output when secrets are missing.

- [ ] **Step 1: Create a manually triggered release workflow**

Define `workflow_dispatch.inputs.tag` as required, set `permissions: contents: write`, and use Node 20 plus Temurin 17. Add a shell step that checks all four secrets are non-empty without printing them. Decode `ANDROID_RELEASE_KEYSTORE_BASE64` to `${RUNNER_TEMP}/radiotedu-release.jks`, then create `mobile/android/keystore.properties` with:

```properties
storeFile=<absolute runner temp keystore path>
storePassword=<ANDROID_KEYSTORE_PASSWORD>
keyAlias=<ANDROID_KEY_ALIAS>
keyPassword=<ANDROID_KEY_PASSWORD>
```

Mask secret values before writing. Install Study/mobile dependencies, run `npm run package:study`, and execute `./gradlew assembleRelease --no-daemon` from `mobile/android`.

- [ ] **Step 2: Add signature and release publication gates**

Locate exactly one `mobile/android/app/build/outputs/apk/release/*-release.apk`; fail on zero or multiple APKs. Run Android SDK `apksigner verify --verbose --print-certs`, rename the verified file to `RadioTEDU-Mobile-${{ inputs.tag }}.apk`, upload it with `actions/upload-artifact@v4`, and publish it with `softprops/action-gh-release@v2` using the same tag.

- [ ] **Step 3: Confirm the workflow contains no secret literals**

Run:

```powershell
git grep -n -E 'storePassword|keyPassword|ANDROID_RELEASE_KEYSTORE_BASE64' -- .github docs mobile/android
```

Expected: only property names, secret names, documentation, and GitHub expression references appear; no credential value appears.

- [ ] **Step 4: Commit release automation**

Run:

```powershell
git add .github/workflows/android-release.yml
git commit -m "ci: add encrypted Android release signing"
```

### Task 6: Run Full Local Verification and Credential Scan

**Files:**
- Modify: none unless a check identifies an in-scope defect.

**Interfaces:**
- Consumes: complete fresh repository.
- Produces: recorded command results and a verified APK candidate.

- [ ] **Step 1: Install locked dependencies**

Run `npm ci` in `study-game/` and `mobile/`.

Expected: both exit 0.

- [ ] **Step 2: Verify Study and mobile behavior**

Run:

```powershell
npm --prefix study-game test
npm --prefix study-game run build
npm --prefix mobile test -- --runInBand
npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json
npx --prefix mobile eslint mobile --quiet
npm --prefix mobile run package:study
npm --prefix mobile run audit:android
```

Expected: every command exits 0; error-only ESLint produces no errors.

- [ ] **Step 3: Build and inspect Android**

Run:

```powershell
& 'mobile\android\gradlew.bat' -p mobile\android assembleDebug --no-daemon
```

Expected: `BUILD SUCCESSFUL` and a debug APK exists under `mobile/android/app/build/outputs/apk/debug/`.

- [ ] **Step 4: Scan the tracked tree and full fresh history**

Use `git ls-files` plus a scripted pattern scan for private-key headers, GitHub tokens, AWS access keys, JWT-shaped values, password assignments, `.env` files, release keystores, and `keystore.properties`. Allow only the standard development `mobile/android/app/debug.keystore` and test fixtures whose values are demonstrably fake. Run `git log --all -p` through the same scanner after the initial commits.

Expected: zero real credential findings and zero unapproved binary signing files.

- [ ] **Step 5: Verify repository scope and clean state**

Run:

```powershell
node --test tests/repository-contract.test.mjs
node scripts/verify-repository.mjs
git diff --check
git status --short
```

Expected: all checks pass and status is clean.

### Task 7: Create the Private GitHub Repository and Publish the Initial APK

**Files:**
- Modify: Git remote metadata only.
- Create remotely: private `akgularda/radiotedumobile` repository and initial QA release.

**Interfaces:**
- Consumes: clean verified `main` history and `RadioTEDU-Mobile-bf6ea0b0-release.apk` QA artifact.
- Produces: private GitHub repository, pushed `main`, verified privacy, and a clearly debug-signed initial APK release.

- [ ] **Step 1: Reconfirm GitHub authentication and target absence**

Run:

```powershell
gh auth status
gh repo view akgularda/radiotedumobile --json nameWithOwner,isPrivate
```

Expected: authenticated as `akgularda`; repository lookup reports not found.

- [ ] **Step 2: Create and push the private repository**

Run:

```powershell
gh repo create akgularda/radiotedumobile --private --source . --remote origin --push --description 'RadioTEDU mobile app, Android Auto integration, and Study game client'
```

Expected: repository created and `main` pushed.

- [ ] **Step 3: Verify privacy and remote state through GitHub**

Run:

```powershell
gh repo view akgularda/radiotedumobile --json nameWithOwner,isPrivate,visibility,defaultBranchRef,url
git ls-remote --heads origin main
```

Expected: `isPrivate: true`, `visibility: PRIVATE`, default branch `main`, and remote head equals local `HEAD`.

- [ ] **Step 4: Publish the existing QA APK with explicit debug-signing metadata**

Copy `C:\Users\akgul\Downloads\rtjukebox\RadioTEDU-Mobile-bf6ea0b0-release.apk` to `RadioTEDU-Mobile-initial-qa-debug-signed.apk`, verify its SHA-256 equals `62B17CBBCC9DA1D501FBDF3259762C8E906D5E1313DD0AB33DABE6032D753CE5`, and create tag/release `v0.1.0-qa` with notes stating it is a debug-signed QA artifact and not a production-signed release.

- [ ] **Step 5: Confirm Actions visibility and document unpopulated secret slots**

Run:

```powershell
gh workflow list --repo akgularda/radiotedumobile
gh secret list --repo akgularda/radiotedumobile
```

Expected: CI and Android release workflows are present. The four signing secrets remain absent until real production values are supplied; no fake value is created.

- [ ] **Step 6: Final verification**

Run `gh run list --repo akgularda/radiotedumobile --limit 5`, wait for the initial CI run to finish, inspect its conclusion, and report the private repository URL, commit, QA release URL, APK hash/signing status, workflow result, and the four still-required production signing secret names without exposing any secret value.
