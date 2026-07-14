export const JUKE_LOCAL_CONTROLLER_URL =
  'https://radiotedu.com/juke-local/controller/';

export function buildJukeLocalControllerUrl(deviceCode?: unknown): string {
  const url = new URL(JUKE_LOCAL_CONTROLLER_URL);
  const normalizedCode =
    typeof deviceCode === 'string' ? deviceCode.trim() : '';

  if (normalizedCode) {
    url.searchParams.set('code', normalizedCode);
  }

  return url.toString();
}

export function isAllowedJukeLocalNavigation(url: string): boolean {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const candidate = new URL(url);
    const controller = new URL(JUKE_LOCAL_CONTROLLER_URL);
    const normalizedPath = candidate.pathname.replace(/\/+$/, '');
    const controllerPath = controller.pathname.replace(/\/+$/, '');

    return (
      candidate.origin === controller.origin &&
      normalizedPath === controllerPath
    );
  } catch {
    return false;
  }
}

export function normalizeJukeLocalAppPath(path: string): string {
  try {
    const candidate = new URL(path, 'https://radiotedu.com/');
    const normalizedPath = candidate.pathname.replace(/\/+$/, '');

    if (normalizedPath !== '/juke-local/controller') {
      return path;
    }

    const code = candidate.searchParams.get('code')?.trim();
    return code ? `jukebox/${encodeURIComponent(code)}` : 'jukebox';
  } catch {
    return path;
  }
}
