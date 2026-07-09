export type SocialAccountSource = {
  id?: unknown;
  display_name?: unknown;
  role?: unknown;
  is_guest?: unknown;
  avatar_url?: unknown;
};

export type SocialAccessDecision =
  | {allowed: true; reason: null}
  | {allowed: false; reason: 'login-required' | 'registered-account-required'};

export type SocialAccountBootstrap = {
  type: 'radiotedu-account';
  version: 1;
  surface: 'social';
  account: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    role: 'member' | 'admin';
  };
};

export type SocialNativeMessage =
  | {type: 'radiotedu:social-ready'}
  | {type: 'radiotedu:request-account'};

export function resolveSocialAccess(account: SocialAccountSource | null | undefined): SocialAccessDecision {
  if (!account || typeof account.id !== 'string' || account.id.trim().length === 0) {
    return {allowed: false, reason: 'login-required'};
  }
  if (account.is_guest === true) {
    return {allowed: false, reason: 'registered-account-required'};
  }
  return {allowed: true, reason: null};
}
export function buildSocialBootstrap(account: SocialAccountSource): SocialAccountBootstrap {
  const access = resolveSocialAccess(account);
  if (!access.allowed) {
    throw new Error(access.reason);
  }

  const id = String(account.id).trim();
  const displayName =
    typeof account.display_name === 'string' && account.display_name.trim().length > 0
      ? account.display_name.trim()
      : 'RadioTEDU Member';

  return {
    type: 'radiotedu-account',
    version: 1,
    surface: 'social',
    account: {
      id,
      displayName,
      avatarUrl: normalizePublicUrl(account.avatar_url),
      role: account.role === 'admin' ? 'admin' : 'member',
    },
  };
}

export function isAllowedSocialNavigation(url: string, allowedRoots: string[]): boolean {
  const candidate = parseHttpUrl(url);
  if (!candidate || candidate.username || candidate.password) {
    return false;
  }

  return allowedRoots.some(rootValue => {
    const root = parseHttpUrl(rootValue);
    if (!root || candidate.origin !== root.origin) {
      return false;
    }

    const rootPath = normalizeRootPath(root.pathname);
    if (rootPath === '/') {
      return true;
    }

    const rootWithoutSlash = rootPath.slice(0, -1);
    return candidate.pathname === rootWithoutSlash || candidate.pathname.startsWith(rootPath);
  });
}

export function parseSocialMessage(rawMessage: string): SocialNativeMessage | null {
  try {
    const message = JSON.parse(rawMessage) as {type?: unknown};
    if (message?.type === 'radiotedu:social-ready') {
      return {type: 'radiotedu:social-ready'};
    }
    if (message?.type === 'radiotedu:request-account') {
      return {type: 'radiotedu:request-account'};
    }
    return null;
  } catch {
    return null;
  }
}

function normalizePublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return parseHttpUrl(value.trim())?.toString() ?? null;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function normalizeRootPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}
