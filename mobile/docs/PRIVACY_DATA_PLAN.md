# RadioTEDU — Privacy, Consent & Anonymized Analytics Plan (GDPR / KVKK)

Status: **plan / spec** (no implementation yet).

Goal: collect **anonymized** audience insight — *who listens, age range, gender,
how many minutes, which channels* — while being fully **KVKK (Law 6698)** and
**GDPR** compliant. Consent is requested **on first launch**, before any data is
collected, and is part of the Terms.

---

## 1. Principles (compliance-first)

1. **Opt-in, not opt-out.** No analytics event leaves the device until the user
   gives **explicit, granular consent**. Default = off.
2. **Anonymized by design.** No name, email, phone, precise location, advertising
   ID, or account id is ever attached to analytics. We use a **rotatable
   pseudonymous install id** only.
3. **Data minimization & purpose limitation.** Collect only the fields below,
   only for audience analytics, nothing else.
4. **Transparency.** Plain-language consent screen + linked Privacy Policy &
   Terms, available any time in Settings.
5. **User control.** Withdraw consent, view, and delete data at any time
   (data-subject rights). Withdrawal stops collection immediately.
6. **Lawful basis:** *explicit consent* (KVKK Art. 5/1, GDPR Art. 6(1)(a) &,
   for gender, Art. 9 explicit consent for special-category data).

---

## 2. What we collect (and what we never collect)

### Collected (only after consent)
| Field | Form | Notes |
| ----- | ---- | ----- |
| Install id | random UUID, rotatable | pseudonymous; not tied to account |
| Age range | bucket: `<18, 18-24, 25-34, 35-44, 45-54, 55+` | self-declared, optional |
| Gender | `female / male / other / prefer-not` | self-declared, **optional**, special-category → separate explicit consent |
| Listening minutes | per channel/podcast, aggregated | duration, not content |
| Sessions | count, start hour (coarse), duration | no timestamps to the second |
| Channel/episode id | which content | no playback position stored server-side |
| App language | `en/tr/ru/…` | from i18n |
| Region | **country/city only** (coarse), from IP at ingest, then discarded | never GPS/precise |
| Platform | OS + app version | for compatibility stats |

### Never collected
Name, email, phone, exact location/GPS, contacts, advertising id, device
fingerprint, raw IP (used transiently for coarse region then dropped), account
linkage to analytics.

---

## 3. Consent flow (first launch)

```
First launch
   │
   ▼
┌──────────────────────────────────────────────┐
│  Welcome + Privacy summary (localized)         │
│  • What we collect (plain language)            │
│  • Links: Privacy Policy · Terms of Use        │
│                                                │
│  [ ] Anonymized usage analytics  (toggle)      │
│  [ ] Demographics (age/gender)   (toggle)      │  ← separate, optional
│                                                │
│   (Decline all)            (Accept selected)   │
└──────────────────────────────────────────────┘
   │ choice persisted (versioned)
   ▼
App proceeds. Collection happens ONLY for toggles set on.
```

- Granular: analytics and demographics are **separate** toggles (special-category
  data needs its own explicit consent).
- "Decline all" is a first-class, equally prominent option (no dark patterns).
- Consent is **versioned**: if the policy changes, re-prompt.
- Re-accessible & changeable anytime: **Settings → Privacy**.

---

## 4. Data-subject rights (KVKK Art. 11 / GDPR Ch. III)

Settings → Privacy exposes:
- **Withdraw consent** (per category) — immediate stop.
- **Access / export** — request the data tied to the install id.
- **Delete** — erase server-side data for the install id; rotate the id.
- Contact channel for requests (KVKK "ilgili kişi başvurusu").

Retention: raw events **≤ 14 months**, then aggregated/irreversibly anonymized.
Documented retention + deletion job.

---

## 5. Technical architecture (infrastructure to build)

```
CLIENT (mobile)
  ConsentContext  ──────────► persists versioned consent (AsyncStorage)
        │  gates everything
        ▼
  analyticsService
    • enabled only if consent.analytics === true
    • buffers events locally, batches every N / on background
    • attaches install id + consented demographics only
    • POST /api/v1/analytics/events  (HTTPS)
        │
        ▼
BACKEND (separate repo)
  /analytics/events  ── validates, strips raw IP→coarse region, stores
  aggregation jobs   ── rollups (minutes per channel, age dist, etc.)
  /analytics/erase   ── data-subject delete by install id
  retention job      ── purge > 14 months
```

Client modules to add (when approved):
- `src/privacy/ConsentContext.tsx` — consent state + versioning + storage.
- `src/screens/ConsentScreen.tsx` — first-launch gate (localized, 6 languages).
- `src/screens/PrivacySettingsScreen.tsx` — manage/withdraw/export/delete.
- `src/services/analyticsService.ts` — buffered, consent-gated event emitter
  (track: `session_start`, `play_start`, `play_heartbeat` (minutes),
  `play_stop`, `app_open`). No-op when consent off.
- `src/privacy/installId.ts` — generate/rotate pseudonymous UUID.
- `src/services/profileService` — optional age-range/gender capture (buckets).
- Hook `analyticsService` into `playbackQueue` start/stop for minutes.

Backend endpoints (separate repo, document as contract):
- `POST /analytics/events` (batch), `POST /analytics/erase`,
  `GET /analytics/export`. IP used only to derive region at ingest, then dropped.

i18n: all consent/privacy strings localized in the 6 languages (new `privacy.*`
keys). RTL respected.

Android Auto: **no analytics prompts or PII in the car**. Listening minutes from
car playback are attributed via the same consent already given in the app; the
car never shows the consent UI (unsafe + already handled in-app).

---

## 6. Terms / Policy artifacts to produce

- **Privacy Policy** (KVKK Aydınlatma Metni + GDPR notice): controller identity,
  data categories, purpose, lawful basis, retention, rights, contact.
- **Explicit consent text** ("Açık Rıza Metni") for demographics.
- **Terms of Use** referencing the above.
- Hosted URLs + in-app rendered copies (localized).

---

## 7. Implementation milestones (when approved to build)

1. `installId` + `ConsentContext` (versioned, persisted, default-off).
2. First-launch `ConsentScreen` (localized, granular, "decline all").
3. `analyticsService` (consent-gated, buffered, batched) + playback hooks.
4. `PrivacySettingsScreen` (withdraw/export/delete) + Settings link.
5. Backend contract (events / erase / export / retention) — separate repo.
6. Privacy Policy + consent texts (localized) + hosting.
7. Verify: nothing emits before consent; withdrawal stops emission; delete works.

## 8. Open questions

- **Controller & contact**: legal entity name + KVKK contact e-mail for the policy?
- **Age/gender capture point**: during consent, in Profile, or a one-time prompt?
- **Analytics backend**: extend the existing RadioTEDU backend, or a dedicated
  service (e.g., self-hosted Matomo/PostHog configured for anonymization)?
- **Minors**: any users under 18 / parental-consent requirement at the school?
