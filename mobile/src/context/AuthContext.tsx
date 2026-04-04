import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { BASE_API } from '../services/config';

const API_URL = BASE_API;

interface User {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    rank_score: number;
    monthly_rank_score?: number;
    role: string;
    is_guest: boolean;
    total_songs_added: number;
    total_upvotes_received: number;
    last_super_vote_at?: string | null;
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

const normalizeUser = (user: Partial<User> & Record<string, any>): User => ({
    id: String(user.id ?? ''),
    email: String(user.email ?? ''),
    display_name: String(user.display_name ?? ''),
    avatar_url: user.avatar_url,
    rank_score: Number(user.rank_score ?? 0),
    monthly_rank_score: Number(user.monthly_rank_score ?? 0),
    role: String(user.role ?? 'guest'),
    is_guest: Boolean(user.is_guest),
    total_songs_added: Number(user.total_songs_added ?? 0),
    total_upvotes_received: Number(user.total_upvotes_received ?? 0),
    last_super_vote_at: user.last_super_vote_at ?? null,
});

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
                setUser(normalizeUser(response.data.data));
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
            const { user: userData, access_token, refresh_token } = response.data.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(normalizeUser(userData));
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
            const { user: userData, access_token, refresh_token } = response.data.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(normalizeUser(userData));
        } catch (error: any) {
            throw new Error(error.response?.data?.error || 'Registration failed');
        }
    };

    const guestLogin = async (displayName: string) => {
        try {
            const response = await axios.post(`${API_URL}/auth/guest`, {
                display_name: displayName
            });
            const { user: userData, access_token, refresh_token } = response.data.data;

            await AsyncStorage.setItem('access_token', access_token);
            await AsyncStorage.setItem('refresh_token', refresh_token);

            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            setUser(normalizeUser(userData));
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
