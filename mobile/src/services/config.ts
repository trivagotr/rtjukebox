import type {StreamQuality} from '../data/radioChannels';

// Default stream quality used by remote/car/voice playback (where the user
// hasn't picked a quality in the app UI).
export const DEFAULT_STREAM_QUALITY: StreamQuality = 'medium';

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
  };
}

const resolvedApiConfig = resolveApiConfig(__DEV__);

export const BASE_API = resolvedApiConfig.baseApi;
export const STORAGE_API = resolvedApiConfig.storageApi;
export const SOCKET_ORIGIN = resolvedApiConfig.socketOrigin;
export const SOCKET_PATH = resolvedApiConfig.socketPath;
