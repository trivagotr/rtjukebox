# Jukebox Web Controller

The web controller for the RadioTEDU Jukebox. It is a React + TypeScript (Vite)
single-page app that guests and admins use to search the catalog, queue songs,
and vote on what is playing. It talks to the jukebox backend over HTTP and a
Socket.IO realtime connection.

## Development

```bash
npm install
npm run dev
```

The dev server runs at the root path (`/`) and, by default, points the API at
the local backend on `http://<host>:3000`.

## Build

```bash
npm run build
```

This runs `tsc -b && vite build` and emits the production bundle to `dist/`.

## How it is served

In production the backend serves the built `dist/` as static files under the
`/controller` path (with SPA history fallback), so the app is reached at
`https://<host>/controller`. The asset base path is set to `/controller/` so the
hashed JS/CSS/asset URLs resolve correctly behind that sub-path.

The backend API itself lives under its own reverse-proxy sub-path
(`/jukebox` by default); the SPA serving path (`/controller`) and the API path
(`/jukebox`) are independent.

## Environment knobs

- `VITE_API_ORIGIN` — overrides the API/socket origin the app talks to. When
  unset, the app uses `http://<host>:3000` in dev and the page's own origin in
  production.
- `VITE_APP_BASE_PATH` — overrides the Vite build base path (where the assets are
  served from). Defaults to `/controller/`. Used by `vite build` / `vite preview`.
- `VITE_PUBLIC_BASE_PATH` — overrides the API reverse-proxy sub-path used to build
  the API root and socket path in production. Defaults to `/jukebox/`. In dev this
  is forced to `/` to match the local backend.
