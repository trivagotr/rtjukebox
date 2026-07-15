# Study Room Overflow Instances Design

## Goal

Guarantee that every person admitted to a Study room instance has a real seat by automatically opening another logical instance when the current one reaches the physical room's seat count. This must not require a second backend process and must preserve the global account, Gold, wardrobe, and Study-time systems.

## Architecture decision

Use server-authoritative logical room instances on the existing Study backend.

- `library` and `chim-alan` remain the canonical physical room IDs.
- An assignment adds an immutable instance ID such as `library-1` or `chim-alan-2` for the duration of the presence lease.
- Library capacity is 51, exactly matching its generated seat definitions.
- Çim Alan capacity is 9, exactly matching its generated amphitheatre seats.
- Presence, chat, and seat occupancy are scoped by both `roomId` and `instanceId`.
- Account identity, Gold, wardrobe ownership/equipment, Study sessions, summaries, and rewards remain account-global and never fork by instance.
- One backend process owns all instances. A second process would duplicate authentication, Gold, sessions, chat, monitoring, and deployment state without solving atomic admission.

## Admission contract

`POST /api/v1/study/instances/join` accepts:

```json
{
  "roomId": "library",
  "preferredInstanceId": "library-1",
  "nodeId": "bottom-center-aisle",
  "position": { "x": 432.86, "y": 1254 },
  "clientSessionId": "stable-per-webview-session-id"
}
```

The server takes a transaction-scoped advisory lock for the physical room, removes no data, counts only live presence leases, and performs one atomic assignment/upsert. Selection order is:

1. Reuse the caller's still-live assignment for reconnect stickiness.
2. Use `preferredInstanceId` when it belongs to the requested room and has capacity.
3. Use the lowest-numbered non-full instance.
4. Create the next logical number when all existing instances are full.

The response contains:

```json
{
  "instance": {
    "id": "library-2",
    "roomId": "library",
    "number": 2,
    "occupancy": 1,
    "capacity": 51,
    "preferredInstanceFull": true
  }
}
```

The join itself writes the initial presence row so simultaneous joins cannot all claim the final slot before their first heartbeat.

## Existing endpoint changes

- `GET /api/v1/study/presence` requires `roomId` and `instanceId` after the migration window and returns only that instance.
- `POST /api/v1/study/presence/heartbeat` includes `instanceId`; the server rejects a mismatched or expired assignment with `409 STUDY_INSTANCE_REJOIN_REQUIRED`.
- `GET/POST /api/v1/study/chat` includes `instanceId`; messages never leak across sibling instances.
- Presence and chat responses include `instanceId` for client-side validation.
- During the additive rollout only, missing instance IDs map to `<roomId>-1`. The final deployment prompt requires removing reliance on this fallback after the mobile/web clients are deployed.

## Client behavior

The Study adapter owns the assignment for each physical room and deduplicates concurrent join requests. `enterRoom`, presence refresh/heartbeat, and chat all wait for the same assignment promise. Room switching requests a new assignment before instance-scoped network work.

The HUD shows `Room 1`, `Room 2`, and so on beside the physical room title. The People panel count and rendered remote avatars include only the assigned instance. The canvas, A* navigation, tap-to-move, tap-to-sit, sitting layers, wardrobe, Gold, and Study timer are unchanged.

The local adapter always exposes instance 1 by default and supports deterministic allocator tests without pretending to be a distributed server.

## Scenarios and required behavior

| Scenario | Required behavior |
| --- | --- |
| 52nd Library join | First 51 remain in `library-1`; user 52 atomically receives `library-2`. |
| 10th Çim Alan join | First 9 remain in `chim-alan-1`; user 10 receives `chim-alan-2`. |
| Two simultaneous last-slot joins | Advisory lock serializes assignment; one gets the last slot and the other gets the next instance. |
| Refresh/reconnect within 35 seconds | Existing live assignment is reused and does not consume another slot. |
| Stale crashed client | Its lease no longer counts after the existing 35-second TTL; no destructive cleanup is needed. |
| Preferred/friend instance has room | Join that instance. |
| Preferred/friend instance is full | Join the lowest available sibling and return `preferredInstanceFull: true` so UI can explain the fallback. |
| Physical room switch | The user's single presence row moves atomically to an instance of the new physical room. |
| Chat or presence queried with another instance | Return no cross-instance data; reject mismatched authenticated writes. |
| Instance becomes empty | Keep no special server process; the logical number becomes reusable from live-presence counts. |
| Backend unavailable during assignment | Keep the user out of shared presence/chat, show a retryable connection state, and never silently merge everyone into instance 1. |
| Account/Gold/wardrobe operations | Continue using the existing account-global endpoints and balances without `instanceId`. |

## Data migration

Add `instance_id` and `client_session_id` columns to `study_room_presence`, backfill active and historical rows to `<room_id>-1`, and add an index on `(room_id, instance_id, last_heartbeat_at DESC)`. Add and backfill `instance_id` on `study_chat_messages` with an index on `(room_id, instance_id, created_at DESC)`.

All migration steps are additive. They must not drop, truncate, recreate, or destructively rewrite existing Study, account, Gold, WordPress, personal-account, or RadioTEDU data.

## Testing

- Pure allocator tests cover exact capacity boundaries, preferred instances, sparse instance reuse, and invalid preferences.
- Backend route tests prove atomic join SQL, sticky reconnect, instance-scoped presence/chat, invalid identifiers, and rejoin-required responses.
- Adapter tests prove join-request deduplication and that every instance-scoped request carries the assigned ID.
- Local adapter and HUD tests prove Room 1 defaults and accessible instance labels.
- Existing Study unit, Playwright, build, mobile packaging, account/Gold contract, and prompt-verification checks remain green.
- A multi-client capacity test creates 52 Library and 10 Çim Alan users and proves the 51/1 and 9/1 distributions.

## Production preservation boundary

The canonical web-server prompt must contain this rule verbatim and treat it as a stop condition:

> NEVER AND NEVER DELETE AND NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS (WHERE RADIOTEDU STUFF DETAILS ARE THERE, most @tedu.edu.tr accounts) AND WORDPRESS PAGES.

The deployment is an additive Study route/schema release only. It must not change Jukebox `/juke-local`, Voting, Music PC ingestion, WordPress, unrelated IIS routes, personal accounts, or university accounts.
