# Web Server–Mobile Contract Design

## Purpose

The production web server must adapt its public interfaces to the RadioTEDU
mobile application. The mobile application is the consumer contract. Existing
working integrations behind the server, especially the Voting project's Music
PC connection, are protected implementation details.

The server handoff must describe three independent projects. A shared hostname,
reverse proxy, or historical URL prefix does not make them one project.

## Project boundaries

| Project | Mobile-facing production contract | Ownership rule |
| --- | --- | --- |
| Juke-local / Jukebox | WebView at `https://radiotedu.com/juke-local/controller/` | Owns the Jukebox controller, QR workflow, and `/juke-local` resources. It does not own Voting or Study. |
| Voting | REST at `https://radiotedu.com/jukebox/api/v1/next-song-voting/...` and Socket.IO at `https://radiotedu.com/jukebox/socket.io` | Independent voting service. Its public mobile adapter may use an existing shared reverse proxy, but it must not be implemented as part of Juke-local. |
| Study | WebView at `https://radiotedu.com/study/` and authenticated API at `https://radiotedu.com/jukebox/api/v1/study` | Independent Study game and API. It must be deployed, tested, and rolled back independently of Juke-local and Voting. |

The `/jukebox` text inside a production URL is an existing infrastructure
prefix. It is not evidence that the Voting project belongs to Juke-local.

## Non-negotiable Voting boundary

The web-server prompt must reproduce this instruction verbatim:

> “Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.”

Operationally, this means:

- Preserve the existing Music PC host, port, protocol, authentication,
  polling/push behavior, message schema, timing, and song-information source
  whenever the current web server can communicate with it.
- Preserve the existing voting engine and Music PC data flow. Do not replace,
  relocate, redesign, or merge it into Juke-local.
- Change only the mobile-facing Voting adapter: request routing, response
  normalization, authentication forwarding, CORS where applicable, and
  Socket.IO delivery required by the current mobile contract.
- If the Music PC cannot be reached, diagnose and report the exact boundary
  that failed. Do not invent a replacement data source or modify the Music PC
  integration without separate approval.
- Never route Voting through `/juke-local`, reuse the Juke-local controller as
  its UI, or couple their service restarts and rollback procedures.

## Mobile-facing data flows

### Juke-local / Jukebox

1. The native Jukebox tab opens `/juke-local/controller/` in a WebView.
2. The Juke-local controller owns its QR reading and Jukebox-specific actions.
3. Web-server routing for `/juke-local` must remain scoped to this project.
4. Changes to Voting or Study must not alter Juke-local behavior.

### Voting

1. The native Voting screen fetches the active round from
   `GET /jukebox/api/v1/next-song-voting/rounds/active`.
2. It submits a vote to
   `POST /jukebox/api/v1/next-song-voting/rounds/{roundId}/votes`.
3. It receives live round events from the `radiotedu.com` Socket.IO origin
   using path `/jukebox/socket.io`.
4. The server-side Voting adapter translates this mobile contract to the
   existing Voting implementation while leaving the Music PC side unchanged.
5. Voting is deployed and verified as its own project even when its public
   routes share a reverse proxy with another service.

### Study

1. The native Study flow opens `/study/` in the authenticated app WebView.
2. The static Study client is built from `study-game` and published at the
   exact `/study/` base path.
3. Study uses the authenticated `/jukebox/api/v1/study` API family.
4. Direct ordinary-browser access remains locked according to the existing
   app-only bridge policy.
5. Study deployment includes its static client, backend support, additive
   database migration, security policy, smoke tests, and a project-specific
   rollback path.

## Server adaptation strategy

The handoff prompt will use a compatibility-adapter strategy:

- Discover the live topology before changing configuration or services.
- Record the existing process, route, and upstream owner for each project.
- Treat the mobile URLs and payload expectations as acceptance criteria.
- Make the smallest server-side changes necessary to satisfy those criteria.
- Keep Juke-local, Voting, and Study in separate route blocks, service
  ownership descriptions, deployment steps, health checks, and rollback steps.
- Stop when a requested change would require modifying a protected working
  Music PC integration and report the blocker instead.

## Handoff prompt structure

The updated web-server Codex prompt will be an ordered checkbox checklist with
these sections:

1. Safety, secrets, backups, and live-topology discovery.
2. Three-project boundary confirmation.
3. Exact mobile route and payload contract inventory.
4. Juke-local preservation and verification.
5. Voting mobile-adapter verification or correction, with the Music PC side
   explicitly frozen when communication works.
6. Study source checkout, tests, build, migration, and deployment.
7. Independent production smoke tests for all three projects.
8. Independent rollback decisions and a final deployment report.

Every action will be written as a checkbox. The prompt will forbid broad
catch-all rewrites, cross-project service restarts, silent endpoint changes,
secret disclosure, and unrelated refactoring.

## Error handling and rollback

- A failure in one project must not trigger an automatic change or rollback in
  another project.
- Failed Study deployment rolls back Study static files, Study backend changes,
  and its migration only as required by the established production procedure.
- Failed Voting mobile adaptation rolls back only the mobile-facing adapter;
  the Music PC integration remains untouched.
- Failed Juke-local checks stop the handoff and preserve the pre-change
  Juke-local release.
- The server Codex must report status codes, service names, deployed commits,
  configuration locations, and rollback locations without exposing secrets.

## Verification design

Before the handoff commit is described as ready:

- Run the complete `study-game` test suite and production build.
- Run the backend test suite and TypeScript build.
- Run the relevant mobile tests for Juke-local WebView routing, Study WebView
  routing, quiz interaction safety, and Voting endpoint construction.
- Inspect the final prompt for unresolved placeholders, contradictory project
  ownership, missing checkbox actions, and accidental Voting/Juke-local merges.
- Confirm the committed branch and exact commit exist on GitHub before placing
  the commit SHA in the server handoff.

