export const STUDY_REMOTE_ROOT = 'https://radiotedu.com/study/';
export const STUDY_PACKAGED_ROOT = 'file:///android_asset/study-game/';

export type StudyRoomId = 'library' | 'chim-alan';

export interface StudyBridgeAccount {
  id: string;
  displayName: string;
  authenticated: boolean;
}

interface StudyPublicBridgeInput {
  account: StudyBridgeAccount;
  globalPoints: number;
}

interface StudySecureBridgeInput extends StudyPublicBridgeInput {
  apiBase: string;
  accessToken: string;
}

const asInjectedJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const buildStudyEntryUrl = (
  roomId: StudyRoomId,
  packaged = false,
) => {
  const root = packaged ? STUDY_PACKAGED_ROOT : STUDY_REMOTE_ROOT;
  return `${root}index.html?embedded=mobile&room=${encodeURIComponent(roomId)}`
    .replace('/study/index.html?', '/study/?');
};

export const isAllowedStudyNavigation = (url: string) => {
  if (url === 'about:blank') {
    return true;
  }

  if (url.startsWith(STUDY_PACKAGED_ROOT)) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'radiotedu.com' &&
      parsed.port === '' &&
      (parsed.pathname === '/study' || parsed.pathname.startsWith('/study/'))
    );
  } catch {
    return false;
  }
};

export const createStudyPublicAccountBridge = (
  input: StudyPublicBridgeInput,
) => `
  (function () {
    window.RadioTEDUStudyAccount = ${asInjectedJson({
      ...input.account,
      globalPoints: input.globalPoints,
    })};
    window.RadioTEDUStudyBridge = null;
    window.dispatchEvent(new CustomEvent('radiotedu:study-account', {detail: window.RadioTEDUStudyAccount}));
    true;
  })();
`;

export const createStudyWebViewBridge = (input: StudySecureBridgeInput) => `
  (function () {
    window.RadioTEDUStudyAccount = ${asInjectedJson({
      ...input.account,
      globalPoints: input.globalPoints,
    })};
    window.RadioTEDUStudyBridge = ${asInjectedJson({
      apiBase: input.apiBase,
      accessToken: input.accessToken,
      account: input.account,
      globalPoints: input.globalPoints,
    })};
    window.dispatchEvent(new CustomEvent('radiotedu:study-account', {detail: window.RadioTEDUStudyAccount}));
    window.dispatchEvent(new CustomEvent('radiotedu:study-bridge-ready'));
    true;
  })();
`;
