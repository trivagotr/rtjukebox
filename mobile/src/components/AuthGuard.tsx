import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import { useNavigation, useRoute } from '@react-navigation/native';

interface AuthGuardProps {
    title?: string;
    message?: string;
    icon?: string;
}

const AuthGuard: React.FC<AuthGuardProps> = (props) => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    // Support both direct props (for tabs) and route params (for stack navigation)
    const title = props.title || route.params?.title || "Giriş Gerekli";
    const message = props.message || route.params?.message || "Bu özelliği kullanmak için giriş yapmalısınız.";
    const icon = props.icon || route.params?.icon || "lock";

    return (
        <View style={styles.container}>
            <View style={styles.navbar}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}>
                    <Icon name="chevron-left" size={32} color={COLORS.text} />
                </TouchableOpacity>
            </View>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Icon name={icon} size={64} color={COLORS.primary} />
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.buttonText}>Giriş Yap</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => navigation.navigate('Register')}
                >
                    <Text style={styles.linkText}>Henüz hesabın yok mu? Kayıt Ol</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        paddingHorizontal: SPACING.xl,
    },
    navbar: {
        height: 60,
        justifyContent: 'center',
        marginTop: SPACING.sm,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginLeft: -SPACING.sm,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginTop: -60, // Compensate for navbar height to center content perfectly
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(227, 30, 36, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.text,
        marginBottom: SPACING.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: COLORS.textMuted,
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 24,
    },
    button: {
        backgroundColor: COLORS.primary,
        width: '100%',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.lg,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    linkButton: {
        padding: SPACING.sm,
    },
    linkText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: '600',
    },
});

export default AuthGuard;
