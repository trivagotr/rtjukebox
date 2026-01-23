import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, TextInput, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import { addRssFeed, getStoredRssFeeds, removeRssFeed } from '../utils/storage';
import { useNavigation } from '@react-navigation/native';

const ProfileScreen = () => {
    const navigation = useNavigation<any>();
    const [isAdmin, setIsAdmin] = useState(false); // Toggle for demo
    const [rssUrl, setRssUrl] = useState('');
    const [savedFeeds, setSavedFeeds] = useState<string[]>([]);

    useEffect(() => {
        loadFeeds();
    }, []);

    const loadFeeds = async () => {
        const feeds = await getStoredRssFeeds();
        setSavedFeeds(feeds);
    };

    const handleAddRss = async () => {
        if (!rssUrl.trim()) return;

        // Basic URL validation
        if (!rssUrl.startsWith('http')) {
            Alert.alert('Hata', 'Geçerli bir URL giriniz.');
            return;
        }

        const success = await addRssFeed(rssUrl.trim());
        if (success) {
            Alert.alert('Başarılı', 'RSS kaynağı eklendi.');
            setRssUrl('');
            loadFeeds();
        } else {
            Alert.alert('Hata', 'Bu kaynak zaten ekli veya bir hata oluştu.');
        }
    };

    const handleRemoveFeed = async (url: string) => {
        Alert.alert(
            'Sil',
            'Bu kaynağı silmek istediğinize emin misiniz?',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: async () => {
                        await removeRssFeed(url);
                        loadFeeds();
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.navbar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={28} color="#000" />
                </TouchableOpacity>
                <Text style={styles.navbarTitle}>Profil</Text>
                <View style={{ width: 28 }} />
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Header */}
                <View style={styles.header}>
                    <View style={styles.avatarContainer}>
                        <Image
                            source={{ uri: 'https://ui-avatars.com/api/?name=Admin+User&background=random' }}
                            style={styles.avatar}
                        />
                        <View style={styles.badge}>
                            <Icon name="shield-check" size={16} color={COLORS.surface} />
                        </View>
                    </View>
                    <Text style={styles.name}>Admin User</Text>
                    <Text style={styles.role}>Station Manager</Text>
                </View>

                {/* Stats Section */}
                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>12</Text>
                        <Text style={styles.statLabel}>Eklenen</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>148</Text>
                        <Text style={styles.statLabel}>Beğeni</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>#1</Text>
                        <Text style={styles.statLabel}>Sıralama</Text>
                    </View>
                </View>

                {/* Admin Section Toggle */}
                <TouchableOpacity
                    style={styles.adminToggle}
                    onPress={() => setIsAdmin(!isAdmin)}
                >
                    <Icon name={isAdmin ? "chevron-up" : "chevron-down"} size={24} color={COLORS.textMuted} />
                    <Text style={styles.sectionTitle}>Admin Paneli ({isAdmin ? 'Açık' : 'Kapalı'})</Text>
                </TouchableOpacity>

                {isAdmin && (
                    <View style={styles.adminSection}>
                        <Text style={styles.adminHint}>Podcast RSS Ekle</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="https://example.com/feed.xml"
                                placeholderTextColor={COLORS.textMuted}
                                value={rssUrl}
                                onChangeText={setRssUrl}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity style={styles.addButton} onPress={handleAddRss}>
                                <Icon name="plus" size={24} color={COLORS.surface} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.adminHint, { marginTop: SPACING.lg }]}>Ekli Kaynaklar</Text>
                        {savedFeeds.length === 0 ? (
                            <Text style={styles.emptyText}>Ekli kaynak yok.</Text>
                        ) : (
                            savedFeeds.map((feed, index) => (
                                <View key={index} style={styles.feedItem}>
                                    <Icon name="rss" size={20} color={COLORS.primary} />
                                    <Text style={styles.feedUrl} numberOfLines={1}>{feed}</Text>
                                    <TouchableOpacity onPress={() => handleRemoveFeed(feed)}>
                                        <Icon name="delete" size={20} color={COLORS.error || '#FF5252'} />
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {/* Settings Items Stub */}
                <View style={styles.settingsSection}>
                    <TouchableOpacity style={styles.settingItem}>
                        <Icon name="cog" size={24} color={COLORS.text} />
                        <Text style={styles.settingText}>Ayarlar</Text>
                        <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem}>
                        <Icon name="bell-outline" size={24} color={COLORS.text} />
                        <Text style={styles.settingText}>Bildirimler</Text>
                        <Icon name="chevron-right" size={24} color={COLORS.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.settingItem}>
                        <Icon name="logout" size={24} color={COLORS.error || '#FF5252'} />
                        <Text style={[styles.settingText, { color: COLORS.error || '#FF5252' }]}>Çıkış Yap</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    navbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
        elevation: 4,
    },
    navbarTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
    scrollContent: { paddingBottom: SPACING.xl },
    header: { alignItems: 'center', padding: SPACING.xl },
    avatarContainer: { position: 'relative', marginBottom: SPACING.md },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    badge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: COLORS.background,
    },
    name: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
    role: { fontSize: 16, color: COLORS.primary },

    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: COLORS.surface,
        margin: SPACING.lg,
        padding: SPACING.lg,
        borderRadius: 16,
        elevation: 4,
    },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
    statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
    divider: { width: 1, backgroundColor: COLORS.border },

    adminToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        backgroundColor: COLORS.surface,
        marginHorizontal: SPACING.lg,
        borderRadius: 12,
        marginBottom: SPACING.md,
    },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginLeft: SPACING.sm },

    adminSection: {
        marginHorizontal: SPACING.lg,
        padding: SPACING.lg,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    adminHint: { color: COLORS.textMuted, marginBottom: SPACING.sm, fontWeight: 'bold' },
    inputContainer: { flexDirection: 'row', alignItems: 'center' },
    input: {
        flex: 1,
        backgroundColor: COLORS.background,
        padding: SPACING.md,
        borderRadius: 8,
        color: COLORS.text,
        marginRight: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    addButton: {
        backgroundColor: COLORS.primary,
        width: 48,
        height: 48,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    feedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background,
        padding: SPACING.sm,
        borderRadius: 8,
        marginTop: SPACING.sm,
    },
    feedUrl: { flex: 1, color: COLORS.text, marginHorizontal: SPACING.sm, fontSize: 12 },
    emptyText: { color: COLORS.textMuted, fontStyle: 'italic', fontSize: 12 },

    settingsSection: { marginHorizontal: SPACING.lg },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    settingText: { flex: 1, marginLeft: SPACING.md, fontSize: 16, color: COLORS.text },
});

export default ProfileScreen;
