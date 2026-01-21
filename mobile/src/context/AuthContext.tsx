import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from '../services/api';

interface AuthContextType {
    user: any;
    loading: boolean;
    login: (data: any) => Promise<void>;
    register: (data: any) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Using a named export 'AuthProvider' instead of default to be explicit
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            const userData = await AsyncStorage.getItem('user');

            if (token && userData) {
                setAuthToken(token);
                setUser(JSON.parse(userData));
            }
        } catch (error) {
            console.log('Failed to load user', error);
        } finally {
            setLoading(false);
        }
    };

    const login = async (data: any) => {
        // In real implementation:
        // const res = await api.post('/auth/login', data);
        // await AsyncStorage.setItem('token', res.data.access_token);
        // ...

        // Mock login
        const mockUser = { id: '1', display_name: 'Ahmet', email: data.email };
        setUser(mockUser);
        await AsyncStorage.setItem('user', JSON.stringify(mockUser));
        await AsyncStorage.setItem('token', 'mock-token');
    };

    const register = async (data: any) => {
        // await api.post('/auth/register', data);
        await login(data);
    };

    const logout = async () => {
        setUser(null);
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');
        setAuthToken(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
