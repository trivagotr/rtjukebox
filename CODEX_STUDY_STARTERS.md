# RadioTEDU Study Codex Starters

Use these short starters in separate Codex tasks after checking out the same handoff branch. Each starter points to a self-contained, detailed English execution prompt.

## Server / radiotedu.com Backend

```text
/goal Use the RadioTEDU Study handoff at https://github.com/trivagotr/rtjukebox/tree/codex/study-amphitheatre-handoff as the authoritative product specification. Open the full server prompt at https://github.com/trivagotr/rtjukebox/blob/codex/study-amphitheatre-handoff/backend/CODEX_STUDY_GLOBAL_POINTS_PROMPT.md, read it completely, and execute it end to end in the backend repository running radiotedu.com. First create a live checkbox to-do plan from every requirement in that prompt, keep exactly one item in progress, and update it after each verified milestone. Implement the canonical /api/v1/study contract, existing-login authentication, server-authoritative global points, wardrobe, room presence, atomic seat reservations, migrations, anti-cheat controls, integration tests, and deployment verification. Do not create a public Study website, a second point wallet, or a second login. Do not mark the goal complete until every completion checkbox in the detailed prompt is backed by authoritative test, database, migration, deployment, and runtime evidence.
```

## Existing Mobile App

```text
/goal Check out or inspect the RadioTEDU Study handoff at https://github.com/trivagotr/rtjukebox/tree/codex/study-amphitheatre-handoff. Open the full mobile/Habbo implementation prompt at https://github.com/trivagotr/rtjukebox/blob/codex/study-amphitheatre-handoff/mobile/CODEX_STUDY_APP_IMPLEMENTATION_PROMPT.md, read it completely, and execute it end to end in the existing RadioTEDU mobile app. First create a live checkbox to-do plan from every requirement in that prompt, keep exactly one item in progress, and update it after each verified milestone. Preserve the approved Library, keep prototypes/library-iso deleted, and do not create a duplicate app. Finish the Çim Alan amphitheatre perspective, elevation-aware A*, visible-chair hit targets, atomic reservation flow, real directional walk/turn/sit/stand animation, synchronized presence, points HUD, clothes and layered avatar previews, Spark, Rock, existing-login-only access, and Android Auto media-only boundaries. Do not mark the goal complete until rendered interaction tests, inspected emulator screenshots, API contract tests, typecheck, unit tests, and the applicable Android build prove every completion checkbox.
```

## Shared Contract

Both tasks must use:

- canonical API prefix `/api/v1/study`,
- location IDs `library` and `chim-alan`,
- existing RadioTEDU app authentication,
- server-authoritative points, wardrobe, presence, and seats,
- no standalone Study access,
- no changes to the approved Library implementation.
