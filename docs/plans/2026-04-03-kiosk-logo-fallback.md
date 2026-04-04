# Kiosk Logo Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the kiosk header text brand with the BYZ logo while keeping `RadioTEDU` as a runtime fallback if the image fails to load.

**Architecture:** Add a small browser-side branding helper that toggles logo and fallback text visibility based on image load state. Keep the existing kiosk header markup and styling intact, only extending it with a served local logo asset and minimal state classes.

**Tech Stack:** Plain HTML, CSS, browser JavaScript, Vitest.

---

### Task 1: Add a failing logo fallback unit test

**Files:**
- Create: `kiosk-web/branding.test.js`
- Create: `kiosk-web/branding.js`

**Step 1: Write the failing test**

Create a focused test that expects:
- fallback text stays hidden after a successful logo load
- fallback text becomes visible after an image error
- the logo container stores a visible state flag

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run ..\\kiosk-web\\branding.test.js`

Expected: FAIL because `branding.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `kiosk-web/branding.js` with a tiny helper that:
- finds the kiosk brand elements
- listens for image `load` and `error`
- hides or shows the fallback text by toggling classes and a data attribute

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run ..\\kiosk-web\\branding.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add kiosk-web/branding.js kiosk-web/branding.test.js
git commit -m "feat: add kiosk logo fallback helper"
```

### Task 2: Wire the helper into the kiosk header

**Files:**
- Modify: `kiosk-web/index.html`
- Modify: `kiosk-web/style.css`
- Modify: `kiosk-web/app.js`
- Create: `kiosk-web/assets/logo-03byz-scaled.png`

**Step 1: Write the failing integration expectation**

Extend the branding test so it expects:
- the helper works with `brandLogo`, `brandLogoImage`, and `brandLogoText`
- the default loaded state keeps the image visible and the text hidden

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run ..\\kiosk-web\\branding.test.js`

Expected: FAIL because kiosk markup and startup wiring do not use the helper yet.

**Step 3: Write minimal implementation**

- Copy the BYZ logo into `kiosk-web/assets/logo-03byz-scaled.png`
- update `kiosk-web/index.html` to replace the emoji brand with an image plus fallback text
- update `kiosk-web/style.css` to size the logo cleanly in the header
- call the branding helper during kiosk startup

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run ..\\kiosk-web\\branding.test.js ..\\kiosk-web\\playback.test.js ..\\kiosk-web\\spotify-player.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add kiosk-web/index.html kiosk-web/style.css kiosk-web/app.js kiosk-web/assets/logo-03byz-scaled.png kiosk-web/branding.js kiosk-web/branding.test.js
git commit -m "feat: add kiosk header logo with text fallback"
```
