import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';

export default function PodcastScreen() {
    const [podcasts, setPodcasts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPodcasts();
    }, []);

    const fetchPodcasts = async () => {
        try {
            const response = await api.get('/podcasts');
            setPodcasts(response.data.items);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const openPodcast = (item: any) => {
        if (item.external_url) {
            Linking.openURL(item.external_url);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => openPodcast(item)}
        >
            <Image
                source={{ uri: item.featured_image || 'https://via.placeholder.com/150' }}
                style={styles.coverImage}
            />
            <View style={styles.cardContent}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.date}>
                    {new Date(item.published_at).toLocaleDateString()}
                </Text>
                <View style={styles.actions}>
                    <View style={styles.spotifyButton}>
                        <Text style={styles.spotifyText}>Spotify'da Dinle</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.header}>Podcastler</Text>
            {loading ? (
                <ActivityIndicator color="#e91e63" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={podcasts}
                    renderItem={renderItem}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.list}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        padding: 20,
    },
    list: {
        padding: 15,
    },
    card: {
        flexDirection: 'row',
        backgroundColor: '#2a2a2a',
        borderRadius: 12,
        marginBottom: 15,
        overflow: 'hidden',
    },
    coverImage: {
        width: 100,
        height: 100,
    },
    cardContent: {
        flex: 1,
        padding: 12,
        justifyContent: 'space-between',
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    date: {
        color: '#888',
        fontSize: 12,
    },
    actions: {
        flexDirection: 'row',
        marginTop: 8,
    },
    spotifyButton: {
        backgroundColor: '#1DB954',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
    },
    spotifyText: {
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold',
    },
});
