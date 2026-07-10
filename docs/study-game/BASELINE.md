# Study Game Recovery Baseline

Date: 2026-07-10
Worktree: `C:\Users\akgul\Downloads\rtjukebox\.worktrees\study-game-oss`
Branch: `codex/study-game-oss`

## Recorded State

The recorded `git status --short --branch` at audit time was:

```text
## codex/study-game-oss
?? docs/superpowers/plans/2026-07-10-study-game-final-open-source-plan.md
?? prototypes/
```

Tracked files were not reported as modified by that command. The untracked plan is the task input. The untracked `prototypes/` tree is preserved user/reference work and is not to be reset, copied over, deleted, or broadly reformatted. This task adds only this document and `ASSET-PROVENANCE.md`.

## Library Reference

`prototypes/library-study/` is a preserved visual and interaction reference, not the production game engine. Its current capabilities include:

- A Library room artwork reference (`assets/library-habbo.png`) and generated room/map references.
- A semantic room model and source-image-backed walkability approach in the prototype, with chair target metadata, occupancy state, seat hotspots, and depth/z-layer information.
- Generated occupied-seat, chair crop, and seated-avatar reference images for evaluating sitting and occlusion.
- Library HUD/reference behaviors including player count, leaderboard, streak, chat, shop, and local avatar/outfit state.
- Eight-direction seated RadioTEDU layer families and an LPC layer spike, each retained for evaluation only until provenance and license gates are satisfied.

The intended recovery direction is a dedicated Phaser/Tiled/Vite/TypeScript game package with real world objects, pathfinding, depth, seats, and layered avatars. The flat Library renderer remains reference material.

## Chim Reference Status

`REJECTED_REFERENCE`: the existing Chim HTML/CSS/JS prototype and its Chim room images are rejected as the implementation starting point. They may remain as historical/reference material only. They must not be presented as accepted production assets or silently reused. The Chim-derived bitmap rows in `ASSET-PROVENANCE.md` are therefore classified `rejected`.

## Secure WebView Direction

Secure packaged-WebView work is later work, not part of this baseline implementation. The useful direction is direct Study entry, reuse of app authentication, a local-asset/navigation allowlist, and no token injection. The current mobile reference uses an injected authentication bridge and a broad HTTP/HTTPS origin whitelist; that is evidence to review, not a completed security gate. No current APK is an accepted Study deliverable.

## Verification Limitations

- The repository verification report dated 2026-06-24 records earlier package checks, but it does not verify this recovered Study game or this asset provenance gate.
- No Study package, engine spike, browser E2E suite, screenshot approval, device proof, or accepted APK exists in this baseline.
- The 191 files under `prototypes/library-study/assets` are hashed in `ASSET-PROVENANCE.md`, but most production-facing images have incomplete or unknown formal provenance.
- Universal LPC obligations are mixed per asset and are not cleared for production. RadioTEDU-generated layers and generated room bitmaps have source/provenance gaps.
- Per Task 0 acceptance rules, no Library, Chim, or avatar production asset should be promoted until origin, author, license, derivative source, generator/version, and attribution obligations are recorded and reviewed.

## Guardrails

Do not copy from another branch over this dirty worktree. Preserve the current Library prototype, screenshots, generated assets, and unrelated user work. This baseline records evidence only; it does not implement game code.
