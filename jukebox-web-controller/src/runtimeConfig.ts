export interface WebRuntimeConfigInput {
  windowOrigin: string;
  windowProtocol: string;
  windowHostname: string;
  isDev: boolean;
  baseUrl: string;
  apiOriginOverride?: string;
}

export interface WebRuntimeConfig {
  apiRoot: string;
  socketUrl: string;
  socketPath: string;
  publicBasePath: string;
}

export function normalizePublicBasePath(baseUrl?: string) {
  if (!baseUrl || baseUrl === '/') {
    return '';
  }

  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export function resolveWebRuntimeConfig(input: WebRuntimeConfigInput): WebRuntimeConfig {
  const publicBasePath = normalizePublicBasePath(input.baseUrl);
  const apiOrigin = input.apiOriginOverride?.trim()
    || (input.isDev
      ? `${input.windowProtocol}//${input.windowHostname}:3000`
      : input.windowOrigin);

  return {
    apiRoot: `${apiOrigin}${publicBasePath}`,
    socketUrl: apiOrigin,
    socketPath: `${publicBasePath || ''}/socket.io`,
    publicBasePath,
  };
}
