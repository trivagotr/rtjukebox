// Kiosk Configuration
// Bu dosyayı her cihaza göre düzenleyin
const getPublicBasePath = () => {
    const pathname = window.location.pathname || '';
    const kioskMatch = pathname.match(/^(.*)\/kiosk(?:\/|$)/);
    if (!kioskMatch) {
        return '';
    }

    return kioskMatch[1] || '';
};

const PUBLIC_BASE_PATH = getPublicBasePath();
const PUBLIC_RUNTIME_CONFIG = window.RADIOTEDU_KIOSK_CONFIG || {};
const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

const normalizePathBase = (value) => {
    const path = String(value || '').trim().replace(/\/+$/, '');
    if (!path || path === '/') {
        return '';
    }
    return path.startsWith('/') ? path : `/${path}`;
};

const getUrlParts = (value) => {
    try {
        const parsed = new URL(value, window.location.origin);
        return {
            origin: parsed.origin,
            pathBase: normalizePathBase(parsed.pathname)
        };
    } catch {
        return {
            origin: window.location.origin,
            pathBase: ''
        };
    }
};

const CONFIGURED_API_BASE = trimTrailingSlash(
    PUBLIC_RUNTIME_CONFIG.API_BASE_URL || PUBLIC_RUNTIME_CONFIG.API_URL
);
const API_BASE = CONFIGURED_API_BASE || (IS_LOCAL_DEV
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.origin}${PUBLIC_BASE_PATH}`);
const API_PARTS = getUrlParts(API_BASE);

const PUBLIC_SITE_BASE = trimTrailingSlash(
    PUBLIC_RUNTIME_CONFIG.PUBLIC_SITE_BASE_URL || PUBLIC_RUNTIME_CONFIG.PUBLIC_SITE_BASE
) || `${window.location.origin}${PUBLIC_BASE_PATH}`;

const QR_LINK_BASE = trimTrailingSlash(
    PUBLIC_RUNTIME_CONFIG.QR_LINK_BASE_URL || PUBLIC_RUNTIME_CONFIG.QR_BASE_URL
) || `${PUBLIC_SITE_BASE}/jukebox`;

const getDeviceCode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromURL = urlParams.get('code');
    if (codeFromURL) {
        localStorage.setItem('device_code', codeFromURL);
        return codeFromURL;
    }
    return '';
};

const getDevicePassword = () => {
    return '';
};

const CONFIG = {
    // Cihaz kodu - dinamik olarak belirlenir
    DEVICE_CODE: getDeviceCode(),
    DEVICE_PWD: getDevicePassword(),

    // Backend API URL
    API_URL: API_BASE,

    // WebSocket URL (genellikle API_URL ile aynı)
    WS_URL: trimTrailingSlash(PUBLIC_RUNTIME_CONFIG.WS_URL)
        || (IS_LOCAL_DEV ? API_BASE : API_PARTS.origin),
    SOCKET_PATH: PUBLIC_RUNTIME_CONFIG.SOCKET_PATH
        || `${API_PARTS.pathBase || PUBLIC_BASE_PATH || ''}/socket.io`,

    // QR kod için web URL formatı
    // Kullanıcı bu URL'yi tarayarak şarkı ekleyecek
    QR_LINK_FORMAT: IS_LOCAL_DEV
        ? `${window.location.protocol}//${window.location.hostname}:5173/jukebox?device={DEVICE_CODE}`
        : `${QR_LINK_BASE}?device={DEVICE_CODE}`,

    // Yeniden bağlanma ayarları
    RECONNECT_INTERVAL: 5000, // 5 saniye

    // Progress bar güncellemeleri
    UI_UPDATE_INTERVAL: 100, // 0.1 saniye (görsel akıcılık için)
    SOCKET_EMIT_INTERVAL: 5000 // 5 saniye (sunucu yükü için)
};
