import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function ProfileScreen() {
    // Mock user data
    const user = {
        name: "Öğrenci",
        rank_score: 1250,
        rank_name: "DJ Çırağı",
        songs_added: 12,
        upvotes: 45
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView>
                <View style={styles.header}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>{user.name[0]}</Text>
                        </View>
                        <View style={styles.rankBadge}>
                            <Icon name="crown" size={14} color="#FFD700" />
                        </View>
                    </View>
                    <Text style={styles.name}>{user.name}</Text>
                    <Text style={styles.rank}>{user.rank_name} • {user.rank_score} Puan</Text>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{user.songs_added}</Text>
                        <Text style={styles.statLabel}>Şarkı</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{user.upvotes}</Text>
                        <Text style={styles.statLabel}>Upvote</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Ayarlar</Text>

                    <TouchableOpacity style={styles.option}>
                        <Icon name="bell-outline" size={24} color="#fff" />
                        <Text style={styles.optionText}>Bildirim Ayarları</Text>
                        <Icon name="chevron-right" size={24} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.option}>
                        <Icon name="logout" size={24} color="#e91e63" />
                        <Text style={[styles.optionText, { color: '#e91e63' }]}>Çıkış Yap</Text>
                    </TouchableOpacity>
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
    header: {
        alignItems: 'center',
        padding: 30,
    },
    avatarContainer: {
        marginBottom: 15,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 40,
        color: '#fff',
        fontWeight: 'bold',
    },
    rankBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#333',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#121212',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
    },
    rank: {
        fontSize: 14,
        color: '#e91e63',
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 20,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#2a2a2a',
        marginBottom: 30,
    },
    statItem: {
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    statDivider: {
        width: 1,
        backgroundColor: '#2a2a2a',
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    section: {
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2a2a2a',
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
    },
    optionText: {
        flex: 1,
        marginLeft: 15,
        fontSize: 16,
        color: '#fff',
    },
});
