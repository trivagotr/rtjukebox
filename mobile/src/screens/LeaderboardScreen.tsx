import React from 'react';
import { View, Text, StyleSheet, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../theme/theme';
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';

const MOCK_LEADERBOARD = [
    { id: '1', name: 'Emre K.', points: 1250, avatar: 'https://ui-avatars.com/api/?name=Emre+K&background=random' },
    { id: '2', name: 'Ayşe Y.', points: 1100, avatar: 'https://ui-avatars.com/api/?name=Ayse+Y&background=random' },
    { id: '3', name: 'Mehmet D.', points: 950, avatar: 'https://ui-avatars.com/api/?name=Mehmet+D&background=random' },
    { id: '4', name: 'Zeynep S.', points: 880, avatar: 'https://ui-avatars.com/api/?name=Zeynep+S&background=random' },
    { id: '5', name: 'Can B.', points: 720, avatar: 'https://ui-avatars.com/api/?name=Can+B&background=random' },
];

const LeaderboardScreen = () => {
    const renderItem = ({ item, index }: { item: typeof MOCK_LEADERBOARD[0], index: number }) => {
        let rankColor = COLORS.text;
        let rankIcon = null;

        if (index === 0) {
            rankColor = '#FFD700'; // Gold
            rankIcon = 'crown';
        } else if (index === 1) {
            rankColor = '#C0C0C0'; // Silver
            rankIcon = 'medal';
        } else if (index === 2) {
            rankColor = '#CD7F32'; // Bronze
            rankIcon = 'medal-outline';
        }

        return (
            <View style={styles.itemContainer}>
                <View style={styles.rankContainer}>
                    {rankIcon ? (
                        <Icon name={rankIcon} size={24} color={rankColor} />
                    ) : (
                        <Text style={styles.rankText}>{index + 1}</Text>
                    )}
                </View>

                <Image source={{ uri: item.avatar }} style={styles.avatar} />

                <View style={styles.infoContainer}>
                    <Text style={styles.name}>{item.name}</Text>
                </View>

                <View style={styles.pointsContainer}>
                    <Text style={styles.points}>{item.points}</Text>
                    <Text style={styles.pointsLabel}>Puan</Text>
                </View>
            </View>
        );
    };

    return (
        <PageTransition>
            <SafeAreaView style={styles.container}>
                <GlobalHeader />
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Sıralama</Text>
                    <Text style={styles.headerSubtitle}>En Aktif Dinleyiciler</Text>
                </View>

                <FlatList
                    data={MOCK_LEADERBOARD}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            </SafeAreaView>
        </PageTransition>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        padding: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
    headerSubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
    listContent: { padding: SPACING.md },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        padding: SPACING.md,
        borderRadius: 12,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    rankContainer: {
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.md,
    },
    rankText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textMuted },
    avatar: { width: 40, height: 40, borderRadius: 20, marginRight: SPACING.md },
    infoContainer: { flex: 1 },
    name: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    pointsContainer: { alignItems: 'flex-end' },
    points: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
    pointsLabel: { fontSize: 10, color: COLORS.textMuted },
});

export default LeaderboardScreen;
