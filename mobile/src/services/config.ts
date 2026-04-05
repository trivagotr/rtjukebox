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
