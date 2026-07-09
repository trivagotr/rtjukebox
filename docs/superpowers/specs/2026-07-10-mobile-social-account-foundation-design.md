# Mobile Social Account Foundation Design

## Goal

Finish the mobile-owned Social and account foundation without defining new backend endpoints, database tables, WebSocket events, or deployment behavior before the server contract is agreed.

## Scope

- Keep the existing RadioTEDU account session as the only mobile identity source.
- Add an explicit `refreshSession()` operation so account/profile changes propagate to Social and other screens.
- Project only safe public account fields into the Social surface.
- Never inject access tokens, refresh tokens, email addresses, or private account payloads into a WebView.
- Restrict Social WebView navigation to explicitly configured Social roots.
- Parse only a small allowlist of page-to-native messages.
- Keep shared room, seat, and presence types transport-neutral.
- Do not modify backend routes, schema, sockets, or server hosting in this phase.

## Account Projection

The Social client receives:

- stable account ID,
- display name,
- avatar URL when available,
- public membership role: `member` or `admin`.

Guests and signed-out users are rejected before the Social surface opens. The projection never contains bearer credentials or private profile fields.

## WebView Boundary

The mobile app may inject a non-secret bootstrap object for presentation. That object is not server authentication. Future server authentication must use a separately reviewed, short-lived, audience-bound handoff mechanism; the mobile client must not guess that protocol now.

The WebView may request the bootstrap again using:

- `radiotedu:social-ready`,
- `radiotedu:request-account`.

Malformed and unknown messages are ignored. Navigation is accepted only when origin and path remain inside a configured Social root.

## Existing Account Integration

`AuthContext` remains responsible for persisted access/refresh tokens and current user state. It exposes `refreshSession()` using the already existing account verification route. Profile avatar updates call it after server success so the app-wide identity and Social projection update without another login.

## Verification

- Pure tests cover access decisions, safe account projection, token exclusion, URL allowlisting, and message parsing.
- Social screen tests verify no token/local-storage/URL credential bridge remains.
- Existing auth/profile tests remain green.
- No backend file is changed.
