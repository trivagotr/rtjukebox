# Mobile Voting WebView handoff

Date: 2026-07-15

## Outcome

The existing `NextSongVote` stack route and Home Vote shortcut now open the production Voting website in a locked-down native WebView. The old `NextSongVotePanel` remains in the repository for compatibility, but it is no longer imported or mounted by `NextSongVoteScreen`; therefore its native round polling, Socket.IO connection, and vote requests do not run on this route.

WebView URL:

- `https://radiotedu.com/vote/?embed=1`

The mobile app never connects directly to the Voting PC. Round, vote, and stream communication belongs to the Voting website and web server.

## Changed files

- `mobile/src/screens/next-song-vote/NextSongVoteScreen.tsx`
- `mobile/src/services/votingWebViewService.ts`
- `mobile/src/services/authSessionEvents.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/src/services/api.ts`
- `mobile/__tests__/votingWebViewService.test.ts`
- `mobile/__tests__/authSessionEvents.test.ts`
- `mobile/__tests__/nextSongVoteWebView.test.ts`
- `mobile/__tests__/nextSongVoteNavigation.test.ts`

## Runtime contract

- Auth is injected only after the website posts `{type: "radiotedu.voting.ready"}`.
- The stored access token and registered user are injected into runtime memory through `window.__RADIOTEDU_SET_AUTH__`; anonymous, guest, logged-out, or tokenless state injects `{accessToken: null, user: null}`.
- Tokens are not placed in the URL, DOM, local storage, console output, analytics, or native logs.
- Login, logout, account deletion, token refresh, app foregrounding, and user changes refresh the WebView auth bridge without recreating the WebView unnecessarily.
- `radiotedu.voting.vote-recorded` is parsed but never causes a native vote request.
- Only HTTPS `radiotedu.com` navigation with exact path `/vote` or `/vote/` stays in the WebView. Explicitly trusted RadioTEDU/TEDU HTTPS links are handed to the system browser; unknown hosts, unsafe schemes, and redirects are blocked.
- Mixed content, third-party/shared cookies, file access, new windows, link previews, DOM storage, and WebView debugging are disabled.
- Loading, offline/error, retry, Android back history, Android renderer loss, and iOS content-process termination are handled natively.

## Production reachability observed

- `GET https://radiotedu.com/jukebox/health` returned a valid healthy response.
- `GET https://radiotedu.com/jukebox/api/v1/next-song-voting/rounds/active` returned a valid success response with `round: null`; this means no active round, not a connection failure.
- `GET https://radiotedu.com/vote/?embed=1` returned HTTP 404 during verification. The mobile route is ready, but the web server must deploy the Voting page at this exact URL before users can see it.

## Verification

- `npm test -- --runInBand __tests__/votingWebViewService.test.ts __tests__/authSessionEvents.test.ts __tests__/nextSongVoteWebView.test.ts __tests__/nextSongVoteNavigation.test.ts` — passed (4 suites, 15 tests).
- `npm test -- --runInBand` — full mobile Jest suite passed.
- `npm run lint` — passed with 0 errors; the repository still reports existing warnings.
- Focused ESLint for all changed voting files — passed with 0 errors.
- `npx tsc --noEmit --pretty false` — repository baseline remains blocked by 48 test-only typing errors in existing `__tests__` files; no production-source or changed-file TypeScript errors were reported.
- `npx react-native bundle --platform android --dev false --entry-file index.js ...` — passed.
- `npx react-native bundle --platform ios --dev false --entry-file index.js ...` — passed.
- `npm run audit:android` — existing publish-readiness checks still fail for SDK level, night launcher icons, orientation, and resizeability; these are unrelated to the Voting WebView change.

`tools/local-voting-agent` was inventoried read-only. Its audio, FFmpeg, Icecast, backend-agent configuration, and secrets were not changed or exposed.
