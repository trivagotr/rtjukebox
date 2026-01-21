import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function JukeboxHomeScreen({ navigation }: any) {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Icon name="music-box-multiple" size={100} color="#e91e63" />
                </View>

                <Text style={styles.title}>Jukebox'a Bağlan</Text>
                <Text style={styles.description}>
                    Yemekhane veya kampüs içindeki aktif Jukebox noktasına bağlanmak için QR kodu okutun.
                </Text>

                <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => navigation.navigate('QRScanner')}
                >
                    <Icon name="qrcode-scan" size={24} color="#fff" />
                    <Text style={styles.buttonText}>QR Tara</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.historyButton}
                    onPress={() => navigation.navigate('Queue')} // For demo/testing without scan
                >
                    <Text style={styles.historyText}>Son Bağlantı: Yemekhane-1</Text>
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
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    iconContainer: {
        marginBottom: 30,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
    },
    description: {
        textAlign: 'center',
        color: '#aaa',
        fontSize: 16,
        marginBottom: 40,
        lineHeight: 24,
    },
    scanButton: {
        flexDirection: 'row',
        backgroundColor: '#e91e63',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        marginBottom: 20,
        elevation: 5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    historyButton: {
        padding: 10,
    },
    historyText: {
        color: '#888',
        textDecorationLine: 'underline',
    },
});
