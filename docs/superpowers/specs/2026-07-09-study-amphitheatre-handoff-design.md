# RadioTEDU Study Amphitheatre Handoff Design

## Objective

Create two canonical Codex execution prompts and a safe GitHub handoff for completing the RadioTEDU Study server and mobile app. The prompts must eliminate API drift and explicitly cover the user-visible failures that source-only tests missed: visible-chair interaction, real character animation, Çim Alan amphitheatre perspective, synchronized movement, points, clothes, and production boundaries.

## Decisions

- Work is pushed on `codex/study-amphitheatre-handoff`, not the unrelated voting branch.
- Only Study/Çim Alan files, required shared dependencies, tests, prompts, plans, and the intentional `prototypes/library-iso/` deletion are staged.
- Existing Library is protected. `prototypes/library-study/` and approved Library assets are not redesigned.
- No duplicate mobile app or standalone Study website is included.
- The canonical location ID is `chim-alan`; `cim-alan` is invalid.
- Canonical APIs live under `/api/v1/study`.
- Temporary `/api/v1/gamification/study-room` routes may remain only as thin authenticated compatibility adapters.

## Canonical API Boundary

The server owns sessions, elapsed eligibility, global point awards/spends, catalog prices, inventory, equipment, room presence, and seat reservations. The app owns rendering, local animation, touch handling, and optimistic presentation only.

The shared endpoints are:

- profile,
- session start/heartbeat/finish,
- room state and presence heartbeat,
- seat reserve/release,
- avatar catalog/profile/purchase/equip.

Both prompts contain the same paths and the same `library | chim-alan` identifiers.

## Seating Contract

A visual chair and semantic seat are one object. Its projected geometry supplies the touch target. A successful interaction is:

visible chair tap -> semantic seat -> A* entry path -> walk animation -> atomic server reservation -> turn -> sit animation -> exact offset/depth -> authoritative presence.

Anonymous detached seat dots, every-other-seat filtering, static state-only sitting, and client-only occupancy are explicitly rejected.

## Animation Contract

The final avatar is not a letter marker. Walking uses multiple visible directional frames and interpolated tile movement. Sitting and standing have visible transitions, correct facing, chair alignment, and depth/occlusion. Tests must observe rendered changes over time, not merely find animation function names.

## Çim Alan Rendering

The map stores elevation and semantic blockers. Only stairs/ramps change elevation. One projection function maps terrain, hit targets, seats, and actors to screen coordinates. Deterministic depth ordering produces a readable amphitheatre instead of skewed top-down rectangles.

## Product Integration

- Study reuses the existing app login and auth token.
- Study remains app-only.
- The Study home and room expose global point status and a complete closet menu.
- Wardrobe purchases and equipment are server-authoritative and visibly affect avatars.
- Spark appears with an AI-style mark and `rtAI - AI Host`; Rock is a separate anchored entity.
- Android Auto remains media-only. Spark/Rock audio can remain available, but Study gameplay cannot.

## Verification Standard

Passing source-string tests is insufficient. Completion requires:

- backend database integration tests for transactions, locks, constraints, replay, races, and migration behavior,
- rendered React Native interaction tests for chair taps and animation states,
- canonical API contract tests,
- package typecheck/lint/test/build commands,
- inspected Android screenshots across supported viewport sizes,
- final Git diff and remote branch verification.

## Git Handoff

The handoff is intentionally a feature branch. Unrelated dirty-worktree files remain unstaged. The remote commit must contain both canonical prompts, the Study implementation snapshot and tests, the plan/design artifacts, and the deletion of `prototypes/library-iso/`. The final response supplies short English starter commands that instruct each Codex instance to open and execute its canonical prompt.
