# RadioTEDU Mobile Standalone Repository Design

## Objective

Create a fresh private GitHub repository at `akgularda/radiotedumobile` containing everything required to develop, test, build, and release the RadioTEDU mobile application without copying unrelated backend, kiosk, voting-PC, or QA artifact history.

## Repository Structure

The repository will use a small monorepo layout:

- `mobile/`: React Native application, Android project, Android Auto declarations, tests, assets, scripts, and the packaged Study fallback.
- `study-game/`: source, tests, assets, and build tooling required by `mobile/package:study`.
- `.github/workflows/`: verification and Android release workflows.
- `docs/`: API/configuration, release signing, secret provisioning, deployment, and verification documentation.
- Root `README.md`, `.gitignore`, `package.json`, and security policy.

The repository starts with fresh history. It will not include the RadioTEDU backend, Jukebox server, kiosk, voting agent, WordPress, unrelated project documentation, local build caches, `node_modules`, emulator data, QA recordings, or generated Gradle output.

## Runtime Contracts

The standalone app preserves the production contracts already implemented:

- RadioTEDU API base: `https://radiotedu.com/jukebox/api/v1`
- Study: `https://radiotedu.com/study/`
- Voting: `https://radiotedu.com/vote/`
- Jukebox controller: `https://radiotedu.com/juke-local/controller/`
- Socket.IO origin/path and radio stream endpoints remain as defined in mobile source.

Jukebox, Voting, and Study remain independent features. Mobile communicates with production web/backend services; it never connects directly to the voting Music PC.

## Secrets and Configuration

Public service URLs, Android manifests, network security policy, package identifiers, deep links, Android Auto metadata, and non-secret configuration are committed normally.

Secret values are never committed as plaintext, even in a private repository. GitHub Actions secrets provide encrypted storage for release credentials and future private API credentials. The repository will define and document these names:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- Optional future private API variables explicitly consumed by application or workflow code

The current workspace contains no production release keystore and no real plaintext production API token to migrate. The existing Android debug keystore is development-only and is not treated as a production signing secret. Safe example configuration files document every required property without secret values.

Mobile user access and refresh tokens continue to be obtained at runtime through authentication and stored only in device storage. They are not repository or GitHub Actions secrets.

## Continuous Integration and Releases

Pull requests and pushes run:

1. Study tests and production build.
2. Mobile Jest tests.
3. Mobile TypeScript checking.
4. Error-only ESLint verification.
5. Study packaging consistency checks.

A manually triggered private Android release workflow reconstructs the release keystore from GitHub Secrets, builds a signed release APK, verifies its signature, and uploads it as a workflow artifact or private GitHub Release. If production signing secrets are absent, the release workflow fails rather than silently publishing a debug-signed production artifact.

## Migration and Verification

The export copies source from commit `bf6ea0b08219c8192c58494e2bc0b8eea87c3bb9`, removes unrelated/generated files, installs dependencies from lockfiles, packages Study, runs the full Study and mobile checks, builds Android, scans the new history for credential patterns, and confirms through the GitHub API that the repository is private.

The already-built APK may be attached to the initial private release with clear debug-signing metadata. A production-signed release requires the four Android signing secrets above.

## Safety

Creating this repository does not modify or delete radiotedu.com files, WordPress pages, accounts, Music PC configuration, production databases, or existing repositories. The source `rtjukebox` working tree and its unrelated dirty files remain untouched except for this reviewed design document.
