import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen({ navigation }: any) {
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.headerTitle}>RadyoTEDU</Text>

                {/* Live Banner */}
                <TouchableOpacity
                    style={styles.liveBanner}
                    onPress={() => navigation.navigate('Radio')}
                >
                    <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>CANLI</Text>
                    </View>
                    <Text style={styles.programTitle}>Sabah Şekeri</Text>
                    <Text style={styles.programSubtitle}>09:00 - 11:00</Text>
                </TouchableOpacity>

                {/* Quick Actions */}
                <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
                <View style={styles.quickActions}>
                    <TouchableOpacity
                        style={styles.actionCard}
                        onPress={() => navigation.navigate('Jukebox', { screen: 'QRScanner' })}
                    >
                        <Text style={styles.actionEmoji}>🎵</Text>
                        <Text style={styles.actionText}>Jukebox Bağlan</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionCard}
                        onPress={() => navigation.navigate('Podcasts')}
                    >
                        <Text style={styles.actionEmoji}>🎙️</Text>
                        <Text style={styles.actionText}>Son Podcastler</Text>
                    </TouchableOpacity>
                </View>

                {/* Announcements */}
                <Text style={styles.sectionTitle}>Duyurular</Text>
                <View style={styles.announcementCard}>
                    <Text style={styles.announcementTitle}>Yemekhane Partisi!</Text>
                    <Text style={styles.announcementDesc}>
                        Bu Cuma müzikleri siz seçiyorsunuz. En çok oy alanlar çalacak.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    scrollContent: {
        padding: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
    },
    liveBanner: {
        backgroundColor: '#e91e63',
        borderRadius: 15,
        padding: 20,
        marginBottom: 25,
    },
    liveIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
        marginRight: 6,
    },
    liveText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    programTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    programSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    quickActions: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 25,
    },
    actionCard: {
        flex: 1,
        backgroundColor: '#2a2a2a',
        borderRadius: 12,
        padding: 15,
        alignItems: 'center',
    },
    actionEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    actionText: {
        color: '#fff',
        fontWeight: '600',
    },
    announcementCard: {
        backgroundColor: '#2a2a2a',
        borderRadius: 12,
        padding: 15,
    },
    announcementTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    announcementDesc: {
        color: '#aaa',
        fontSize: 14,
        lineHeight: 20,
    },
});
