import axios from 'axios';

// For Production: 'https://api.radiotedu.com/api/v1'
// For Development: Use your PC IP address (e.g., 'http://192.168.1.5:3000/api/v1')
const BASE_URL = __DEV__
  ? 'http://10.0.2.2:3000/api/v1'
  : 'https://radiotedu-backend.onrender.com/api/v1'; // placeholder production URL

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
