import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { BASE_API } from '../services/config';

const API_URL = BASE_API;

export interface User {
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
    birth_year?: number | null;
    preferred_language?: string | null;
    gold_balance?: number;
}

export interface RegistrationOnboarding {
    birthYear: number;
    preferredLanguage: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string, onboarding: RegistrationOnboarding) => Promise<void>;
    guestLogin: (displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<User | null>;
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
    birth_year: user.birth_year == null ? null : Number(user.birth_year),
    preferred_language: user.preferred_language == null ? null : String(user.preferred_language),
    gold_balance: Number(user.gold_balance ?? 0),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const clearSessionState = useCallback(async () => {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    }, []);

    const refreshSession = useCallback(async (): Promise<User | null> => {
        try {
            const accessToken = await AsyncStorage.getItem('access_token');
            if (!accessToken) {
                setUser(null);
                return null;
            }

            axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            const response = await axios.get(`${API_URL}/auth/me`);
            const nextUser = normalizeUser(response.data.data);
            setUser(nextUser);
            return nextUser;
        } catch (error) {
            await clearSessionState();
            throw error;
        }
    }, [clearSessionState]);

    useEffect(() => {
        loadStorageData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadStorageData = async () => {
        try {
            await refreshSession();
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

    const register = async (email: string, password: string, displayName: string, onboarding: RegistrationOnboarding) => {
        try {
            const response = await axios.post(`${API_URL}/auth/register`, {
                email,
                password,
                display_name: displayName,
                birth_year: onboarding.birthYear,
                preferred_language: onboarding.preferredLanguage
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

    const logout = clearSessionState;

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, guestLogin, logout, refreshSession }}>
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
