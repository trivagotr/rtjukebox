# Text Encoding Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent Turkish text corruption across restore/import, backend write paths, uploaded filenames, and metadata synchronization.

**Architecture:** Add a shared backend text-normalization utility, integrate it into all user-facing write paths, and pair it with a byte-safe restore script plus an idempotent repair command. Keep the repair logic conservative so healthy text remains untouched while known mojibake patterns are corrected.

**Tech Stack:** Node.js, TypeScript, Express, Multer, PostgreSQL, Vitest, PowerShell

---

### Task 1: Build the Shared Text Normalization Utility

**Files:**
- Create: `backend/src/utils/textNormalization.ts`
- Create: `backend/src/utils/textNormalization.test.ts`
- Modify: `backend/package.json`

**Step 1: Write the failing test**

Create `backend/src/utils/textNormalization.test.ts` with focused cases for:
- healthy text: `"Tuna Özsarı"` stays unchanged
- mojibake repair: `"S├╝per Admin"` becomes `"Süper Admin"`
- mojibake repair: `"R├£YA"` becomes `"RÜYA"`
- mojibake repair: `"G├Âky├╝z├╝"` becomes `"Gökyüzü"`
- idempotence: normalizing a repaired string returns the same string
- filename normalization: `"Semicenk - Çıkmaz Bir Sokakta.mp3"` stays valid

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: FAIL because the utility module does not exist yet.

**Step 3: Write minimal implementation**

Create `backend/src/utils/textNormalization.ts` with:
- suspicious mojibake detection
- conservative `cp850 -> utf8` repair
- Unicode NFC normalization
- filename normalization that preserves Turkish characters and safe separators
- helper for building song file URLs from normalized filenames

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: PASS with all normalization cases green.

**Step 5: Commit**

```bash
git add backend/src/utils/textNormalization.ts backend/src/utils/textNormalization.test.ts backend/package.json
git commit -m "feat: add text normalization utilities"
```

Task 1 execution note:
- add `iconv-lite` as a direct dependency in `backend/package.json` and `backend/package-lock.json` because the utility imports it directly

### Task 2: Apply Normalization to Auth and Upload Ingestion

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/middleware/upload.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Extend `backend/src/utils/textNormalization.test.ts` with route-adjacent unit cases for:
- display names normalized before persistence
- uploaded song filenames normalized without stripping Turkish characters

Use small pure-function tests instead of route integration tests if no HTTP test harness exists yet.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: FAIL because the current upload sanitization regex and auth paths do not use the shared normalizer.

**Step 3: Write minimal implementation**

Update:
- `backend/src/routes/auth.ts` to normalize `display_name` in register and guest flows before insert
- `backend/src/middleware/upload.ts` to replace the current broken Turkish-character regex with shared filename normalization

Keep avatar upload behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: PASS with display-name and filename cases green.

**Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/middleware/upload.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: normalize auth and upload text inputs"
```

### Task 3: Apply Normalization to Jukebox and Metadata Write Paths

**Files:**
- Modify: `backend/src/routes/jukebox.ts`
- Modify: `backend/src/services/metadata.ts`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add test cases for:
- title and artist parsed from filenames during scan-folder
- file URL generation from normalized filenames
- metadata updates normalizing `trackName`, `artistName`, and `collectionName`

Keep tests at the helper-function level if direct route testing would require broader infrastructure.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: FAIL because `jukebox.ts` and `metadata.ts` still write raw values.

**Step 3: Write minimal implementation**

Update:
- `backend/src/routes/jukebox.ts` to normalize device names, device locations, parsed song titles/artists, and shared `file_url` creation
- `backend/src/services/metadata.ts` to normalize values returned from iTunes before saving

Do not normalize technical IDs or query parameters.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: PASS with filename-derived and metadata-derived cases green.

**Step 5: Commit**

```bash
git add backend/src/routes/jukebox.ts backend/src/services/metadata.ts backend/src/utils/textNormalization.test.ts
git commit -m "feat: normalize jukebox and metadata text writes"
```

### Task 4: Add the Database Repair Script

**Files:**
- Create: `backend/src/scripts/repairTextEncoding.ts`
- Modify: `backend/package.json`
- Test: `backend/src/utils/textNormalization.test.ts`

**Step 1: Write the failing test**

Add pure-function tests that simulate repair decisions for:
- damaged rows get repaired
- healthy rows are unchanged
- a second pass produces no further changes

If needed, expose a small pure helper from the script or utility module so the repair decision is testable without a real database.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/textNormalization.test.ts`

Expected: FAIL because repair decision helpers and script entrypoint do not exist yet.

**Step 3: Write minimal implementation**

Create `backend/src/scripts/repairTextEncoding.ts` that:
- connects to PostgreSQL using `DATABASE_URL`
- scans the approved user-facing text columns
- repairs only values whose quality improves after normalization
- logs counts per table/column
- is safe to rerun

Add a script entry in `backend/package.json`, for example:
- `repair:text`: `tsx src/scripts/repairTextEncoding.ts`

**Step 4: Run test to verify it passes**

Run:
- `npx vitest run src/utils/textNormalization.test.ts`
- `npm run repair:text`

Expected:
- unit tests PASS
- repair script completes without changing healthy rows

**Step 5: Commit**

```bash
git add backend/src/scripts/repairTextEncoding.ts backend/package.json backend/src/utils/textNormalization.test.ts
git commit -m "feat: add database text repair command"
```

### Task 5: Add a Byte-Safe Restore Script and Update Documentation

**Files:**
- Create: `docker_export/restore-database.ps1`
- Modify: `docker_export/README.md`
- Modify: `docs/07-security-deployment.md`

**Step 1: Write the failing test**

Document the operational failure case in the plan implementation notes:
- current restore guidance uses a text pipe
- PowerShell can reinterpret dump bytes

For automated coverage, add a small fixture-based check if practical, otherwise rely on manual verification steps in Step 4.

**Step 2: Run test to verify it fails**

Run a manual dry check against the current docs:
- inspect `docker_export/README.md`
- confirm it still recommends `cat database_dump.sql | ... psql ...`

Expected: FAIL from an operational-safety perspective because the documented path is not byte-safe.

**Step 3: Write minimal implementation**

Create `docker_export/restore-database.ps1` that:
- accepts a dump file path
- runs `psql` with `-f`
- sets `PGCLIENTENCODING=UTF8`
- never pipes dump text through PowerShell

Update documentation to point all restore instructions to the script.

**Step 4: Run test to verify it passes**

Run:
- `powershell -ExecutionPolicy Bypass -File docker_export/restore-database.ps1 -WhatIf`
  or an equivalent dry-run mode if you build one
- review updated docs to confirm the unsafe pipeline is gone

Expected:
- restore script is invokable
- docs direct operators to the safe path only

**Step 5: Commit**

```bash
git add docker_export/restore-database.ps1 docker_export/README.md docs/07-security-deployment.md
git commit -m "docs: harden database restore workflow"
```

### Task 6: Full Verification

**Files:**
- Verify: `backend/src/utils/textNormalization.ts`
- Verify: `backend/src/routes/auth.ts`
- Verify: `backend/src/middleware/upload.ts`
- Verify: `backend/src/routes/jukebox.ts`
- Verify: `backend/src/services/metadata.ts`
- Verify: `backend/src/scripts/repairTextEncoding.ts`
- Verify: `docker_export/restore-database.ps1`

**Step 1: Run backend tests**

Run: `npx vitest run`

Expected: PASS

**Step 2: Run backend build**

Run: `npm run build`

Expected: PASS with no TypeScript errors.

**Step 3: Run smoke checks**

Run representative checks against the running backend:
- login response returns `Tuna Özsarı`
- song search returns normalized `RÜYA`
- upload/scan paths keep normalized filenames and file URLs

Expected: PASS with healthy Unicode in responses.

**Step 4: Run repair command twice**

Run:
- `npm run repair:text`
- `npm run repair:text`

Expected:
- first run may report fixes on damaged data
- second run reports zero changes

**Step 5: Commit**

```bash
git add .
git commit -m "chore: verify text encoding hardening"
```
