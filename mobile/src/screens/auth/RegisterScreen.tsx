import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

export default function RegisterScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { register } = useAuth();
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!name || !email || !password) {
            Alert.alert('Hata', 'Lütfen tüm alanları doldurun');
            return;
        }

        setLoading(true);
        try {
            await register({ display_name: name, email, password });
        } catch (error) {
            Alert.alert('Hata', 'Kayıt yapılamadı');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Kayıt Ol</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Ad Soyad"
                    placeholderTextColor="#888"
                    value={name}
                    onChangeText={setName}
                />

                <TextInput
                    style={styles.input}
                    placeholder="E-posta"
                    placeholderTextColor="#888"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Şifre"
                    placeholderTextColor="#888"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleRegister}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? 'Kaydediliyor...' : 'Kayıt Ol'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.linkText}>Zaten hesabın var mı? Giriş Yap</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    content: {
        flex: 1,
        padding: 30,
        justifyContent: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 40,
        textAlign: 'center',
    },
    input: {
        backgroundColor: '#2a2a2a',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
        color: '#fff',
        fontSize: 16,
    },
    button: {
        backgroundColor: '#e91e63',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    linkButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    linkText: {
        color: '#e91e63',
        fontSize: 14,
    },
});
