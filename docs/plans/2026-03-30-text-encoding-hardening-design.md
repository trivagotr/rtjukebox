# Text Encoding Hardening Design

**Date:** 2026-03-30

**Problem**

Turkish characters in user-facing text are getting corrupted into mojibake during database restore and some runtime text ingestion paths. This affects user display names, song titles, album names, device locations, and file-derived URLs.

**Goal**

Make text handling safe end-to-end so that:
- healthy Unicode text stays unchanged
- mojibake is repaired only when confidence is high
- file names and file URLs stay in sync
- database restore on Windows does not re-encode SQL dumps
- existing damaged rows can be repaired with a repeatable maintenance command

**Root Cause**

There are two distinct failure modes:
- Restore/import: PowerShell text pipelines can reinterpret dump bytes, which turns UTF-8 SQL dumps into mojibake before `psql` receives them.
- Runtime ingestion: user names, metadata, and file-derived text are written in multiple places without a shared normalization layer, so damaged input can persist.

**Recommended Approach**

Use a defense-in-depth design with three layers:
- restore/import hardening
- runtime normalization and selective repair
- maintenance repair script for already-damaged data

This avoids relying on a single procedural fix and keeps healthy text untouched.

## Architecture

### 1. Shared Text Normalization Module

Create a single backend utility module that owns all text cleanup logic.

Core responsibilities:
- `normalizeText(value)`: trim, normalize to Unicode NFC, collapse unsafe whitespace when appropriate
- `looksMojibake(value)`: detect suspicious mojibake markers such as `Ã`, `Ä`, `Å`, `â`, and DOS box-drawing characters
- `repairMojibake(value)`: attempt a controlled `cp850 -> utf8` repair only when quality improves
- `normalizeFilename(value)`: normalize uploaded file names while preserving Turkish characters and safe separators
- `buildSongFileUrl(filename)`: derive `/uploads/songs/...` URLs from normalized filenames instead of hand-building paths in multiple places

Design rules:
- idempotent
- conservative
- no changes to clearly healthy text
- never used for technical identifiers such as emails, UUIDs, tokens, hashes, or secrets

### 2. Runtime Integration Points

Integrate the shared module into every user-facing write path:
- `backend/src/routes/auth.ts`
  normalize `display_name` for register and guest login
- `backend/src/middleware/upload.ts`
  normalize uploaded song filenames before saving to disk
- `backend/src/routes/jukebox.ts`
  normalize device name, location, title/artist parsed from filenames, and use shared file URL construction
- `backend/src/services/metadata.ts`
  normalize `trackName`, `artistName`, and `collectionName` before updating `songs`

This ensures that new writes stay clean even if an upstream system sends damaged text.

### 3. Restore/Import Hardening

Replace text-pipe based restore instructions with a byte-safe script.

Requirements:
- call `psql -f <dump>` directly instead of piping dump text through PowerShell
- explicitly set UTF-8 client encoding
- document the safe restore path in `docker_export/README.md`
- provide a Windows-friendly script that users can run without inventing their own import pipeline

### 4. Repair Script

Add a targeted repair script for existing data.

Scope:
- scan selected public text columns known to hold user-facing text
- repair only rows where `repairMojibake(value)` produces a higher-quality result
- be idempotent so repeated runs produce zero further changes

Initial target fields:
- `users.display_name`
- `devices.name`
- `devices.location`
- `songs.title`
- `songs.artist`
- `songs.album`
- `songs.file_url`

## Quality Heuristics

Automatic repair must not blindly rewrite text.

Accept a repaired candidate only if:
- suspicious mojibake markers decrease
- invalid replacement markers do not increase
- the output contains more plausible Turkish characters or otherwise cleaner Unicode
- the output differs from the input

Reject the candidate if:
- it introduces replacement characters
- it worsens readability
- the source text is already healthy

## Testing Strategy

### Unit Tests

Add tests for the normalization module covering:
- healthy Turkish text remains unchanged
- known mojibake samples are repaired
- repeated normalization is stable
- filename normalization keeps Turkish characters and safe separators

### Integration Checks

Verify runtime behavior for:
- guest/register/login display names
- song upload flow
- folder scan flow
- metadata sync updates

### Operational Checks

Verify restore/import and repair scripts by:
- importing a fixture containing Turkish text through the safe restore path
- running the repair script twice and confirming the second run makes no changes

## Success Criteria

The change is successful when:
- new user and song text stays correct in the database
- uploaded filenames and stored `file_url` values match
- metadata sync cannot reintroduce mojibake
- restore guidance no longer depends on text pipelines
- maintenance repair can safely clean existing damaged rows
