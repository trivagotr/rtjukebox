// Kiosk Configuration
// Bu dosyayı her cihaza göre düzenleyin
const CONFIG = {
    // Cihaz kodu - her kiosk için benzersiz olmalı
    DEVICE_CODE: 'CAFE-001',

    // Backend API URL
    API_URL: 'http://localhost:3000',

    // WebSocket URL (genellikle API_URL ile aynı)
    WS_URL: 'http://localhost:3000',

    // QR kod için deep link formatı
    // Mobil uygulama bu URL'yi yakalayacak
    QR_LINK_FORMAT: 'radiotedu://jukebox/{DEVICE_CODE}',

    // Alternatif: Web URL (mobil uygulama yoksa)
    // QR_LINK_FORMAT: 'https://radiotedu.com/jukebox/{DEVICE_CODE}',

    // Yeniden bağlanma ayarları
    RECONNECT_INTERVAL: 5000, // 5 saniye

    // Progress bar güncelleme sıklığı
    PROGRESS_UPDATE_INTERVAL: 1000 // 1 saniye
};
