# Study / Çim Alan GitHub Handoff

## Purpose

This branch is an implementation handoff, not a claim that the final Study experience is complete. It preserves the relevant current Study work, removes the rejected `prototypes/library-iso/` prototype, and supplies two canonical Codex goals for completing the server and mobile product.

## Canonical Execution Files

- `backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md`
- `mobile/CODEX_STUDY_APP_IMPLEMENTATION_PROMPT.md`
- `CODEX_STUDY_STARTERS.md`
- `docs/superpowers/specs/2026-07-09-study-amphitheatre-handoff-design.md`
- `docs/superpowers/plans/2026-06-30-chim-alan-study-global-points.md`

## Included Scope

- Current Study screens, service, map/A* model, Spark logo, and focused tests.
- Current backend Study routes, Study room compatibility routes, schema additions, and focused tests.
- Shared semantic seat-slot helper required by the Study map.
- The intentional deletion of the rejected standalone `prototypes/library-iso/` implementation and its generated assets/screenshots.
- Detailed server and mobile execution prompts sharing the same `/api/v1/study` contract and `chim-alan` identifier.

## Explicitly Excluded

- Unrelated notification, social-room, voting, podcast, admin, analytics, icon, and generated app changes in the dirty worktree.
- The untracked duplicate `mobile-gamification/` application tree.
- Any redesign or regeneration of the approved Library implementation.
- Any claim that radiotedu.com has already deployed the canonical server contract.

## Known Product Gaps Assigned to the Mobile Goal

- Visible chairs are not yet the authoritative semantic hit targets.
- The existing detached/limited seat-dot interaction must be replaced.
- The current final avatar marker is not a production character renderer.
- Directional walk, turn, sit, seated-idle, and stand transitions still require real visible animation.
- Movement position must be lifted into authoritative presence heartbeat state.
- Çim Alan still requires true elevation-aware amphitheatre projection and inspected emulator screenshots.
- Clothes require real previews and visible application to local/remote avatars.

## Verification Recorded Before Commit

- Mobile focused Study tests: 5 suites passed, 35 tests passed.
- Backend focused Study/gamification tests: 2 files passed, 25 tests passed.
- Backend TypeScript build: passed.
- Mobile TypeScript: Study-related errors are zero after the seat-slot return-type fix.
- Mobile TypeScript still exits nonzero on pre-existing out-of-scope errors in `podcastService.test.ts` and missing Jest globals in `qrLinking.test.ts`.

The execution prompts prohibit closing their goals until behavior tests, database integration tests, visual evidence, and applicable builds prove the complete user-facing and security requirements.
