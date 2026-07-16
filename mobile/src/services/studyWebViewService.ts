import {parseHttpUrl} from './safeHttpUrlService';

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

  const parsed = parseHttpUrl(url);
  return Boolean(
    parsed &&
      parsed.protocol === 'https:' &&
      parsed.hostname === 'radiotedu.com' &&
      parsed.port === '' &&
      !parsed.hasCredentials &&
      (parsed.pathname === '/study' || parsed.pathname.startsWith('/study/')),
  );
};

export const shouldUsePackagedStudyFallback = (
  url: string,
  usingPackagedGame: boolean,
) => !usingPackagedGame && !isAllowedStudyNavigation(url);

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
    var studyStorageValues = Object.create(null);
    var isolatedStudyStorage = {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(studyStorageValues, String(key))
          ? studyStorageValues[String(key)]
          : null;
      },
      setItem: function (key, value) {
        studyStorageValues[String(key)] = String(value);
      },
      removeItem: function (key) {
        delete studyStorageValues[String(key)];
      },
      clear: function () {
        studyStorageValues = Object.create(null);
      },
      key: function (index) {
        return Object.keys(studyStorageValues)[index] || null;
      }
    };
    Object.defineProperty(isolatedStudyStorage, 'length', {
      get: function () { return Object.keys(studyStorageValues).length; }
    });
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: isolatedStudyStorage
      });
    } catch (_) {}

    if (typeof window.fetch === 'function') {
      var nativeStudyFetch = window.fetch.bind(window);
      window.fetch = window.fetch.bind(window);
      var legacyToClientWearable = {
        'default-hair': 'short-hair',
        'default-top': 'radio-hoodie',
        'default-bottom': 'jeans',
        'default-shoes': 'sneakers'
      };
      var clientToLegacyWearable = {
        'short-hair': 'default-hair',
        'radio-hoodie': 'default-top',
        'jeans': 'default-bottom',
        'sneakers': 'default-shoes'
      };
      window.fetch = async function (resource, options) {
        var requestUrl = typeof resource === 'string'
          ? resource
          : (resource && resource.url ? resource.url : String(resource));
        var requestOptions = options;
        if (
          (requestUrl.indexOf('/study/avatar/equip') !== -1 ||
            requestUrl.indexOf('/study/avatar/purchase') !== -1) &&
          options && typeof options.body === 'string'
        ) {
          try {
            var requestBody = JSON.parse(options.body);
            if (typeof requestBody.itemId === 'string' && clientToLegacyWearable[requestBody.itemId]) {
              requestBody.itemId = clientToLegacyWearable[requestBody.itemId];
              requestOptions = Object.assign({}, options, {body: JSON.stringify(requestBody)});
            }
          } catch (_) {}
        }
        var response = await nativeStudyFetch(resource, requestOptions);
        if (requestUrl.indexOf('/study/avatar/me') === -1) {
          return response;
        }
        return {
          ok: response.ok,
          status: response.status,
          json: async function () {
            var payload = await response.json();
            var avatar = payload && payload.data;
            if (avatar && Array.isArray(avatar.ownedItemIds)) {
              avatar.ownedItemIds = avatar.ownedItemIds.map(function (id) {
                return legacyToClientWearable[id] || id;
              });
            }
            if (avatar && avatar.equipped && typeof avatar.equipped === 'object') {
              Object.keys(avatar.equipped).forEach(function (slot) {
                var id = avatar.equipped[slot];
                avatar.equipped[slot] = legacyToClientWearable[id] || id;
              });
            }
            return payload;
          }
        };
      };
    }
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
