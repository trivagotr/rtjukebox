# GitHub Pages Fallback Kiosk

This branch deploys the temporary fallback jukebox as a GitHub Pages site.

## Public URLs

- Kiosk screen: `https://trivagotr.github.io/rtjukebox/kiosk/`
- Phone jukebox page: `https://trivagotr.github.io/rtjukebox/jukebox/`

The kiosk URL is fixed. It does not need `?code=`, does not ask for a visitor name, and does not read or send a jukebox device password.

## GitHub Actions

Workflow: `.github/workflows/deploy-github-pages.yml`

The workflow:

- installs and tests `kiosk-web`
- installs, tests, and builds `jukebox-web-controller`
- assembles `dist/github-pages` with `/kiosk/` and `/jukebox/`
- publishes that artifact to the `gh-pages` branch

Repository Pages should use the `gh-pages` branch from `/ (root)` as its source. This branch-publish path works for maintainers with push access even when the repository has not yet enabled GitHub Pages through the Pages API.

## Backend URL

GitHub Pages only hosts static files. Live search, queue, kiosk registration, sockets, and Spotify playback still require a reachable jukebox backend.

Set repository variables if the backend is not served from the same origin:

- `JUKEBOX_API_BASE_URL`: full backend public base, for example `https://temporary.example.com/jukebox`
- or `JUKEBOX_API_ORIGIN`: backend origin, for example `https://temporary.example.com`
- optional `JUKEBOX_PUBLIC_BASE_PATH`: backend public base path, default `/jukebox`

If both `JUKEBOX_API_BASE_URL` and `JUKEBOX_API_ORIGIN` are absent, the static site still deploys, but browser API calls will default to the GitHub Pages origin and will not reach a Node backend.
