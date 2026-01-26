import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Replace with your local network IP for physical device testing
const API_URL = 'http://10.0.2.2:3000/api/v1'; // Android Emulator default host loopback

interface User {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    rank_score: number;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    guestLogin: (displayName: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadStorageData();
    }, []);

    const loadStorageData = async () => {
        try {
            const accessToken = await AsyncStorage.getItem('access_token');
            if (accessToken) {
                // Set default axios header
                axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

                // Fetch profile to verify token
                const response = await axios.get(`${API_URL}/auth/me`);
                setUser(response.data);
            }
        } catch (error) {
            console.log('[AuthContext] No valid session found');
            await logout();
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email: string, password: string) => {
        try {
            const response = await axios.post(`${API_URL}/auth/login`, { email, password });
            const { user: userData, access_token, refresh_token } = response.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(userData);
        } catch (error: any) {
            throw new Error(error.response?.data?.error || 'Login failed');
        }
    };

    const register = async (email: string, password: string, displayName: string) => {
        try {
            const response = await axios.post(`${API_URL}/auth/register`, {
                email,
                password,
                display_name: displayName
            });
            const { user: userData, access_token, refresh_token } = response.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(userData);
        } catch (error: any) {
            throw new Error(error.response?.data?.error || 'Registration failed');
        }
    };

    const guestLogin = async (displayName: string) => {
        try {
            const response = await axios.post(`${API_URL}/auth/guest`, {
                display_name: displayName
            });
            const { user: userData, access_token, refresh_token } = response.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(userData);
        } catch (error: any) {
            throw new Error(error.response?.data?.error || 'Guest login failed');
        }
    };

    const logout = async () => {
        await AsyncStorage.removeItem('access_token');
        await AsyncStorage.removeItem('refresh_token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, guestLogin, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
