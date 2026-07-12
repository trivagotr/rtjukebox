# Notification Admin Panel Prompt

Use this prompt in Codex when building or updating the server/admin page.

```text
Build a published admin notification panel for RadioTEDU.

This panel is server/admin only. Do not render it in the mobile app or public
consumer app.

Use the existing backend endpoints:

- POST /api/v1/notifications/admin/preview
  - Admin bearer auth.
  - Body: title, body, category, audience, optional deep_link, dry_run=true.
  - Shows normalized payload and targeted device-token count without sending.

- POST /api/v1/notifications/admin/send
  - Admin bearer auth.
  - Body: title, body, category, audience, optional deep_link, dry_run boolean.
  - dry_run=true records an audit row but sends no FCM.
  - dry_run=false sends through FCM and records audit_id, targeted, sent, failed.

- GET /api/v1/notifications/admin/stats
  - Admin bearer auth.
  - Returns totals: sends, targeted, sent, failed.
  - Returns recent audit rows: id, category, audience, targeted, sent, failed, dry_run, created_at.

- GET /api/v1/notifications/admin/panel-prompt
  - Admin bearer auth.
  - Returns the machine-readable contract and this panel-building prompt.

- GET /api/v1/notifications/admin/statistics-prompt
  - Admin bearer auth.
  - Returns the machine-readable contract for a statistics-only dashboard.

Supported categories: podcast, radio, jukebox, events, system.
Supported audiences: all, podcast, radio, jukebox, events.

UI requirements:

- Dry-run is the default action.
- Show targeted device count before real send.
- Real send must require an explicit Send action.
- Include title, body, category, audience, deep link, dry-run toggle, preview/send status.
- Include deep-link presets for latest podcast, live radio, jukebox device code, and event detail.
- Show FCM delivery stats: total sends, targeted, sent, failed, failure rate, last run.
- Show recent audit rows with dry-run/sent state and timestamps.
- Never expose FCM tokens.
- Never expose this admin panel in the mobile app.
- Never send automatically on page load.
- Keep the UI compact and suitable for repeated admin operations.
```

## Statistics-only prompt

```text
Build a published notification statistics dashboard for the RadioTEDU server/admin page.

This dashboard is server/admin only. Do not render statistics in the mobile app
or public consumer app.

Use:

- GET /api/v1/notifications/admin/stats
  - Admin bearer auth.
  - Returns totals: sends, targeted, sent, failed.
  - Returns recent audit rows: id, category, audience, targeted, sent, failed, dry_run, created_at.

Show these widgets:

- Total sends
- Targeted devices
- Delivered
- Failed
- Failure rate = failed / targeted
- Delivery rate = sent / targeted
- Last run summary
- Recent audit log table

Rules:

- Never show FCM tokens or user identifiers.
- Never expose this statistics dashboard in the mobile app.
- Never send notifications from the statistics-only dashboard.
- Keep previous stats visible if refresh fails.
- Show an empty state when there are no notification sends or dry-runs yet.
```
