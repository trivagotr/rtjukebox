import {
  encodeFormQueryValue,
  getSearchParameter,
  parseHttpUrl,
} from './safeHttpUrlService';

export const JUKE_LOCAL_CONTROLLER_URL =
  'https://radiotedu.com/juke-local/controller/';

export function buildJukeLocalControllerUrl(deviceCode?: unknown): string {
  const normalizedCode =
    typeof deviceCode === 'string' ? deviceCode.trim() : '';

  return normalizedCode
    ? `${JUKE_LOCAL_CONTROLLER_URL}?code=${encodeFormQueryValue(normalizedCode)}`
    : JUKE_LOCAL_CONTROLLER_URL;
}

export function isAllowedJukeLocalNavigation(url: string): boolean {
  if (url === 'about:blank') {
    return true;
  }

  const candidate = parseHttpUrl(url);
  const controller = parseHttpUrl(JUKE_LOCAL_CONTROLLER_URL);
  if (!candidate || !controller || candidate.hasCredentials) {
    return false;
  }

  const normalizedPath = candidate.pathname.replace(/\/+$/, '');
  const controllerPath = controller.pathname.replace(/\/+$/, '');
  return candidate.origin === controller.origin && normalizedPath === controllerPath;
}

export function normalizeJukeLocalAppPath(path: string): string {
  const candidate = parseHttpUrl(path, 'https://radiotedu.com/');
  if (!candidate || candidate.hasCredentials) {
    return path;
  }

  const normalizedPath = candidate.pathname.replace(/\/+$/, '');
  if (normalizedPath !== '/juke-local/controller') {
    return path;
  }

  const code = getSearchParameter(candidate.search, 'code')?.trim();
  return code ? `jukebox/${encodeURIComponent(code)}` : 'jukebox';
}
