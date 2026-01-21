import axios from 'axios';

// Replace with your actual machine IP for emulator access
// e.g., http://10.0.2.2:3000 for Android Emulator
// e.g., http://localhost:3000 for iOS Simulator
const API_URL = 'http://10.0.2.2:3000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const setAuthToken = (token: string | null) => {
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common['Authorization'];
    }
};

export default api;
