import axios from 'axios';

// Kiosk için sunucu adresi - kurulum sırasında ayarlanır
const API_URL = 'http://192.168.1.100:3000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

export default api;
