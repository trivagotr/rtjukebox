import axios from 'axios';

// Use 10.0.2.2 for Android Emulator to access host's localhost
const BASE_URL = 'http://10.0.2.2:3000/api/v1';

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
