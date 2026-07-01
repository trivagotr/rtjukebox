import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_API = 'http://10.98.98.66:8090/api/v1';

export const API_ORIGIN = BASE_API.replace(/\/api\/v1$/, '');

const api = axios.create({
  baseURL: BASE_API,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async config => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  },
);

export default api;
