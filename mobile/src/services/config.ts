import type {StreamQuality} from '../data/radioChannels';

// Default stream quality used by remote/car/voice playback (where the user
// hasn't picked a quality in the app UI). Keep this aligned with the in-app
// radio default so car, Bluetooth and voice playback are not downgraded.
export const DEFAULT_STREAM_QUALITY: StreamQuality = 'high';

// Google Analytics 4 (Measurement Protocol) credentials. Create a GA4 property,
// then Admin → Data Streams → Measurement Protocol API secrets.
// Grant only RadioTEDU managers access to the GA4 property to view the data.
// Leave blank to disable analytics entirely (the app then never sends events).
export const GA4_MEASUREMENT_ID = ''; // e.g. 'G-XXXXXXXXXX'
export const GA4_API_SECRET = ''; // e.g. 'abcdEf12...'
export const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

export function isAnalyticsConfigured(): boolean {
  return GA4_MEASUREMENT_ID.length > 0 && GA4_API_SECRET.length > 0;
}

// Audio stream of the restaurant Jukebox (the communal selection). When set,
// the car "Jukebox" category lets the driver LISTEN to what TEDU is playing
// (listen-only — no adding/voting/QR in the car). Empty = listen disabled.
export const JUKEBOX_STREAM_URL = ''; // e.g. 'https://stream.radiotedu.com/jukebox'

export const SERVER_DOMAIN = 'radiotedu.com';
export const PROD_SERVER_ORIGIN = `https://${SERVER_DOMAIN}/jukebox`;
export const DEV_SERVER_ORIGIN = 'http://127.0.0.1:3000';
export const PROD_FOCUS_WEB_URL = `https://${SERVER_DOMAIN}/focus/`;
export const DEV_FOCUS_WEB_URL = 'http://127.0.0.1:4177/index.html';
export const SOCIAL_WEB_URL = `https://${SERVER_DOMAIN}/social/`;

export function resolveApiConfig(isDev: boolean) {
  const serverOrigin = isDev ? DEV_SERVER_ORIGIN : PROD_SERVER_ORIGIN;
  const socketOrigin = isDev ? DEV_SERVER_ORIGIN : `https://${SERVER_DOMAIN}`;
  const socketPath = isDev ? '/socket.io' : '/jukebox/socket.io';

  return {
    serverOrigin,
    baseApi: `${serverOrigin}/api/v1`,
    storageApi: serverOrigin,
    socketOrigin,
    socketPath,
    focusWebUrl: isDev ? DEV_FOCUS_WEB_URL : PROD_FOCUS_WEB_URL,
    socialWebUrl: SOCIAL_WEB_URL,
  };
}

const resolvedApiConfig = resolveApiConfig(__DEV__);

export const BASE_API = resolvedApiConfig.baseApi;
export const STORAGE_API = resolvedApiConfig.storageApi;
// Next-song voting is published at the backend root, while the legacy Jukebox
// API remains mounted below /jukebox. Keep this separate to avoid rerouting
// established account and queue traffic.
export const NEXT_SONG_VOTE_API = __DEV__
  ? `${DEV_SERVER_ORIGIN}/api/v1`
  : `https://${SERVER_DOMAIN}/api/v1`;
export const SOCKET_ORIGIN = resolvedApiConfig.socketOrigin;
export const SOCKET_PATH = resolvedApiConfig.socketPath;
export const FOCUS_WEB_URL = resolvedApiConfig.focusWebUrl;
export const RESOLVED_SOCIAL_WEB_URL = resolvedApiConfig.socialWebUrl;
