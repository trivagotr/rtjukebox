export type SafeHttpProtocol = 'http:' | 'https:';

export interface SafeHttpUrl {
  protocol: SafeHttpProtocol;
  hostname: string;
  port: string;
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
  hasCredentials: boolean;
}

const HTTP_URL_PATTERN = /^(https?):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

function hasUnsafeRawCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127 || character === '\\') {
      return true;
    }
  }

  return false;
}

function hasValidHostname(hostname: string) {
  if (
    !hostname ||
    hostname.startsWith('.') ||
    hostname.endsWith('.') ||
    hostname.includes('..') ||
    !/^[a-z\d.-]+$/.test(hostname)
  ) {
    return false;
  }

  return hostname
    .split('.')
    .every(label => label && !label.startsWith('-') && !label.endsWith('-'));
}

function resolveCandidate(value: string, baseOrigin?: string) {
  if (HTTP_URL_PATTERN.test(value)) {
    return value;
  }

  if (!baseOrigin || URL_SCHEME_PATTERN.test(value) || value.startsWith('//')) {
    return null;
  }

  const base = parseHttpUrl(baseOrigin);
  if (!base) {
    return null;
  }

  return `${base.origin}/${value.replace(/^\/+/, '')}`;
}

export function parseHttpUrl(
  rawValue: string,
  baseOrigin?: string,
): SafeHttpUrl | null {
  if (
    typeof rawValue !== 'string' ||
    rawValue.length === 0 ||
    hasUnsafeRawCharacter(rawValue)
  ) {
    return null;
  }

  const value = resolveCandidate(rawValue, baseOrigin);
  const match = value?.match(HTTP_URL_PATTERN);
  if (!match) {
    return null;
  }

  const protocol = `${match[1].toLowerCase()}:` as SafeHttpProtocol;
  let authority = match[2];
  const atIndex = authority.lastIndexOf('@');
  const hasCredentials = atIndex >= 0;
  if (hasCredentials) {
    authority = authority.slice(atIndex + 1);
  }

  if (!authority || authority.includes('@') || authority.includes('%')) {
    return null;
  }

  const colonIndex = authority.lastIndexOf(':');
  if (colonIndex !== authority.indexOf(':')) {
    return null;
  }

  let hostname = authority;
  let port = '';
  if (colonIndex >= 0) {
    hostname = authority.slice(0, colonIndex);
    port = authority.slice(colonIndex + 1);
    if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) {
      return null;
    }
  }

  hostname = hostname.toLowerCase();
  if (!hasValidHostname(hostname)) {
    return null;
  }

  if ((protocol === 'https:' && port === '443') || (protocol === 'http:' && port === '80')) {
    port = '';
  }

  const pathname = match[3] || '/';
  if (!pathname.startsWith('/')) {
    return null;
  }

  const search = match[4] || '';
  const hash = match[5] || '';
  const origin = `${protocol}//${hostname}${port ? `:${port}` : ''}`;

  return {
    protocol,
    hostname,
    port,
    origin,
    pathname,
    search,
    hash,
    href: `${origin}${pathname}${search}${hash}`,
    hasCredentials,
  };
}

export function getSearchParameter(search: string, name: string) {
  const query = search.startsWith('?') ? search.slice(1) : search;
  for (const field of query.split('&')) {
    if (!field) {
      continue;
    }

    const separator = field.indexOf('=');
    const rawKey = separator >= 0 ? field.slice(0, separator) : field;
    const rawValue = separator >= 0 ? field.slice(separator + 1) : '';
    try {
      if (decodeURIComponent(rawKey.replace(/\+/g, ' ')) === name) {
        return decodeURIComponent(rawValue.replace(/\+/g, ' '));
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function encodeFormQueryValue(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}
