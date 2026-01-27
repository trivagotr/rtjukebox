// Kiosk Configuration
// Bu dosyayı her cihaza göre düzenleyin
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

const getDeviceCode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromURL = urlParams.get('code');
    if (codeFromURL) {
        localStorage.setItem('device_code', codeFromURL);
        return codeFromURL;
    }
    return localStorage.getItem('device_code') || '';
};

const getDevicePassword = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pwdFromURL = urlParams.get('pwd');
    if (pwdFromURL) {
        localStorage.setItem('device_pwd', pwdFromURL);
        return pwdFromURL;
    }
    return localStorage.getItem('device_pwd') || '';
};

const CONFIG = {
    // Cihaz kodu - dinamik olarak belirlenir
    DEVICE_CODE: getDeviceCode(),
    DEVICE_PWD: getDevicePassword(),

    // Backend API URL
    API_URL: API_BASE,

    // WebSocket URL (genellikle API_URL ile aynı)
    WS_URL: API_BASE,

    // QR kod için web URL formatı
    // Kullanıcı bu URL'yi tarayarak şarkı ekleyecek
    QR_LINK_FORMAT: `${window.location.protocol}//${window.location.hostname}:5173/?code={DEVICE_CODE}`,

    // Yeniden bağlanma ayarları
    RECONNECT_INTERVAL: 5000, // 5 saniye

    // Progress bar güncellemeleri
    UI_UPDATE_INTERVAL: 100, // 0.1 saniye (görsel akıcılık için)
    SOCKET_EMIT_INTERVAL: 5000 // 5 saniye (sunucu yükü için)
};
