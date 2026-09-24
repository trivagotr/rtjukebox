// Kiosk Configuration
// Bu dosyayı her cihaza göre düzenleyin
const getPublicBasePath = () => {
    const pathname = window.location.pathname || '';
    const match = pathname.match(/^(.*)\/kiosk(?:\/|$)/);
    return match ? match[1] : '';
};

const PUBLIC_BASE_PATH = getPublicBasePath();
const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = IS_LOCAL_DEV
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin;

const getDeviceCode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('pwd')) {
        urlParams.delete('pwd');
        const cleanUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams}` : ''}${window.location.hash || ''}`;
        window.history?.replaceState?.({}, '', cleanUrl);
    }
    const codeFromURL = urlParams.get('code');
    if (codeFromURL) {
        localStorage.setItem('device_code', codeFromURL);
        return codeFromURL;
    }
    return localStorage.getItem('device_code') || '';
};

const CONFIG = {
    // Cihaz kodu - dinamik olarak belirlenir
    DEVICE_CODE: getDeviceCode(),

    // Backend API URL
    API_URL: API_BASE,

    // WebSocket URL (genellikle API_URL ile aynı)
    WS_URL: IS_LOCAL_DEV ? API_BASE : window.location.origin,
    SOCKET_PATH: `${PUBLIC_BASE_PATH || ''}/socket.io`,

    // QR kod için web URL formatı
    // Kullanıcı bu URL'yi tarayarak şarkı ekleyecek
    QR_LINK_FORMAT: IS_LOCAL_DEV
        ? `${window.location.protocol}//${window.location.hostname}:5173/?code={DEVICE_CODE}`
        : `${window.location.origin}${PUBLIC_BASE_PATH || ''}/?code={DEVICE_CODE}`,

    // Yeniden bağlanma ayarları
    RECONNECT_INTERVAL: 5000, // 5 saniye

    // Progress bar güncellemeleri
    UI_UPDATE_INTERVAL: 100, // 0.1 saniye (görsel akıcılık için)
    SOCKET_EMIT_INTERVAL: 1000 // 1 saniye (canlı üye senkronizasyonu için)
};
