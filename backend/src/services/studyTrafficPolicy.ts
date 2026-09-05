const STUDY_PLAYER_API_ROOT = '/api/v1/study';
const NON_PLAYER_SUFFIXES = ['/admin', '/health', '/pages'];

export function isStudyPlayerApiPath(requestPath: string, publicBasePath = ''): boolean {
    let pathname = String(requestPath || '').split('?', 1)[0] || '/';
    const base = normalizeBase(publicBasePath);
    if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
        pathname = pathname.slice(base.length) || '/';
    }

    if (pathname !== STUDY_PLAYER_API_ROOT && !pathname.startsWith(`${STUDY_PLAYER_API_ROOT}/`)) {
        return false;
    }

    const suffix = pathname.slice(STUDY_PLAYER_API_ROOT.length);
    return !NON_PLAYER_SUFFIXES.some((excluded) => suffix === excluded || suffix.startsWith(`${excluded}/`));
}

function normalizeBase(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '';
    const leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return leading.endsWith('/') ? leading.slice(0, -1) : leading;
}
