import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import io from 'socket.io-client';

export default function QueueScreen({ navigation }: any) {
    const [queue, setQueue] = useState<any[]>([]);
    const [nowPlaying, setNowPlaying] = useState<any>(null);

    useEffect(() => {
        // Mock socket connection
        // const socket = io('https://api.radiotedu.com');
        // socket.emit('join_device', 'DEVICE_ID');
        // socket.on('queue_updated', (data) => { ... });

        // Mock Data
        setNowPlaying({
            id: '1', title: 'Bohemian Rhapsody', artist: 'Queen',
            cover_url: 'https://via.placeholder.com/150', votes: 15,
            added_by: { display_name: 'Ahmet' }
        });
        setQueue([
            { id: '2', title: 'Hotel California', artist: 'Eagles', votes: 10, position: 1 },
            { id: '3', title: 'Imagine', artist: 'John Lennon', votes: 8, position: 2 },
        ]);
    }, []);

    const handleVote = (id: string, type: 'up' | 'down') => {
        console.log(`Vote ${type} for ${id}`);
        // api.post('/jukebox/vote', { queue_item_id: id, vote: type === 'up' ? 1 : -1 });
    };

    const renderQueueItem = ({ item }: { item: any }) => (
        <View style={styles.queueItem}>
            <Text style={styles.position}>{item.position}</Text>
            <View style={styles.songInfo}>
                <Text style={styles.songTitle}>{item.title}</Text>
                <Text style={styles.songArtist}>{item.artist}</Text>
            </View>
            <View style={styles.voteControls}>
                <TouchableOpacity onPress={() => handleVote(item.id, 'up')}>
                    <Icon name="arrow-up-bold" size={24} color="#4CAF50" />
                </TouchableOpacity>
                <Text style={styles.voteCount}>{item.votes}</Text>
                <TouchableOpacity onPress={() => handleVote(item.id, 'down')}>
                    <Icon name="arrow-down-bold" size={24} color="#F44336" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.locationTitle}>Yemekhane-1</Text>
                    <Text style={styles.activeUsers}>👥 12 Aktif</Text>
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => navigation.navigate('SongSearch')}
                >
                    <Icon name="plus" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Now Playing */}
            {nowPlaying && (
                <View style={styles.nowPlayingCard}>
                    <Image source={{ uri: nowPlaying.cover_url }} style={styles.coverImage} />
                    <View style={styles.npInfo}>
                        <Text style={styles.npLabel}>ŞU AN ÇALIYOR</Text>
                        <Text style={styles.npTitle}>{nowPlaying.title}</Text>
                        <Text style={styles.npArtist}>{nowPlaying.artist}</Text>
                        <Text style={styles.npRequester}>İsteyen: {nowPlaying.added_by.display_name}</Text>
                    </View>
                </View>
            )}

            {/* Queue List */}
            <Text style={styles.sectionTitle}>Sıradakiler</Text>
            <FlatList
                data={queue}
                renderItem={renderQueueItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#1e1e1e',
    },
    locationTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    activeUsers: {
        color: '#4CAF50',
        fontSize: 12,
    },
    addButton: {
        backgroundColor: '#e91e63',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nowPlayingCard: {
        flexDirection: 'row',
        backgroundColor: '#2a2a2a',
        margin: 20,
        borderRadius: 12,
        padding: 15,
        elevation: 3,
    },
    coverImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
    },
    npInfo: {
        marginLeft: 15,
        flex: 1,
        justifyContent: 'center',
    },
    npLabel: {
        color: '#e91e63',
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    npTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    npArtist: {
        color: '#ccc',
        fontSize: 14,
    },
    npRequester: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 20,
        marginBottom: 10,
    },
    list: {
        paddingHorizontal: 20,
    },
    queueItem: {
        flexDirection: 'row',
        backgroundColor: '#1e1e1e',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    position: {
        color: '#888',
        fontSize: 18,
        fontWeight: 'bold',
        width: 30,
    },
    songInfo: {
        flex: 1,
    },
    songTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    songArtist: {
        color: '#aaa',
        fontSize: 14,
    },
    voteControls: {
        alignItems: 'center',
    },
    voteCount: {
        color: '#fff',
        fontWeight: 'bold',
        marginVertical: 4,
    },
});
