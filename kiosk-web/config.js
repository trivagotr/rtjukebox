// Kiosk Configuration
// Bu dosyayı her cihaza göre düzenleyin
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

const CONFIG = {
    // Cihaz kodu - her kiosk için benzersiz olmalı
    DEVICE_CODE: 'RADIO-01',

    // Backend API URL
    API_URL: API_BASE,

    // WebSocket URL (genellikle API_URL ile aynı)
    WS_URL: API_BASE,

    // QR kod için web URL formatı
    // Kullanıcı bu URL'yi tarayarak şarkı ekleyecek
    QR_LINK_FORMAT: `http://192.168.0.13:5173/?code={DEVICE_CODE}`,

    // Alternatif: Web URL (mobil uygulama yoksa)
    // QR_LINK_FORMAT: 'https://radiotedu.com/jukebox/{DEVICE_CODE}',

    // Yeniden bağlanma ayarları
    RECONNECT_INTERVAL: 5000, // 5 saniye

    // Progress bar güncelleme sıklığı
    PROGRESS_UPDATE_INTERVAL: 1000 // 1 saniye
};
