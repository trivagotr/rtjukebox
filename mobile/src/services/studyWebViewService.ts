export const STUDY_GAME_ASSET_ROOT = 'file:///android_asset/study-game/';
export const STUDY_LIBRARY_ENTRY_URL = `${STUDY_GAME_ASSET_ROOT}index.html?embedded=mobile`;

export type StudyWebAccountSource = {
  id?: unknown;
  display_name?: unknown;
  email?: unknown;
  avatar_url?: unknown;
  gold_balance?: unknown;
  rank_score?: unknown;
};

export type StudyWebBootstrap = {
  embedded: true;
  account: {
    id: string;
    displayName: string;
    globalPoints: number;
    authenticated: true;
  };
};

export type StudyWebMessage =
  | {type: 'radiotedu:library-ready'}
  | {type: 'radiotedu:request-account'};

export function buildStudyWebBootstrap(account: StudyWebAccountSource): StudyWebBootstrap {
  const displayName =
    typeof account.display_name === 'string' && account.display_name.trim()
      ? account.display_name.trim()
      : typeof account.email === 'string' && account.email.trim()
        ? account.email.trim()
        : 'RadioTEDU user';

  return {
    embedded: true,
    account: {
      id: String(account.id ?? ''),
      displayName,
      globalPoints: normalizePointBalance(account.gold_balance ?? account.rank_score),
      authenticated: true,
    },
  };
}

export function isAllowedStudyNavigation(url: string): boolean {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const candidate = new URL(url);
    if (candidate.protocol !== 'file:') {
      return false;
    }

    const decodedPath = decodeURIComponent(candidate.pathname).replace(/\\/g, '/');
    return decodedPath.startsWith('/android_asset/study-game/');
  } catch {
    return false;
  }
}

export function createStudyWebViewBridge(bootstrap: StudyWebBootstrap): string {
  const publicPayload = JSON.stringify(bootstrap).replace(/</g, '\\u003c');

  return `
    (function () {
      var studyBootstrap = ${publicPayload};
      var studyAccount = studyBootstrap.account;
      var appAuth = {
        type: 'radiotedu-auth',
        source: 'radiotedu-mobile',
        embedded: true,
        user: {
          id: studyAccount.id,
          display_name: studyAccount.displayName
        }
      };

      try {
        [
          'radiotedu_access_token',
          'access_token',
          'refresh_token',
          'radiotedu_api_base'
        ].forEach(function (key) { window.localStorage.removeItem(key); });
        window.localStorage.setItem('radiotedu_embedded_user', JSON.stringify(appAuth.user));
      } catch (error) {}

      window.RadioTEDUStudyAccount = studyAccount;
      window.RadioTEDUAppAuth = appAuth;

      try {
        window.dispatchEvent(new CustomEvent('radiotedu-study-auth', {detail: studyAccount}));
        window.dispatchEvent(new CustomEvent('radiotedu:auth', {detail: appAuth}));
        document.dispatchEvent(new CustomEvent('radiotedu:auth', {detail: appAuth}));
      } catch (error) {}

      true;
    })();
  `;
}

export function parseStudyWebMessage(rawMessage: string): StudyWebMessage | null {
  try {
    const message = JSON.parse(rawMessage) as {type?: unknown};
    if (message?.type === 'radiotedu:library-ready') {
      return {type: 'radiotedu:library-ready'};
    }
    if (message?.type === 'radiotedu:request-account') {
      return {type: 'radiotedu:request-account'};
    }
  } catch {
    return null;
  }

  return null;
}

function normalizePointBalance(value: unknown): number {
  const points = Number(value);
  return Number.isFinite(points) && points >= 0 ? Math.floor(points) : 0;
}
