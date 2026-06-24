# Architecture Research: RT Jukebox

## Component Boundaries

- Backend owns auth, database schema, CORS, Socket.IO, Spotify, jukebox queue/catalog, podcast feeds, and gamification APIs.
- Mobile consumes backend APIs through shared Axios service code and owns React Native screens.
- Web controller and kiosk web are independent browser surfaces with their own package verification.

## Integration Points Verified

- Mobile jukebox search calls `GET /api/v1/jukebox/songs` with Axios `params`.
- Backend returns `success: true` and `data.items` for the mobile search result list.
- Authenticated backend endpoints accept JWT access tokens issued by register/login flows.
- Docker Postgres migration applies the same schema used by backend runtime routes.
