import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../../services/api';

export default function SongSearchScreen({ navigation }: any) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const searchSongs = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const response = await api.get('/jukebox/songs', { params: { search: query } });
            setResults(response.data.items);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const addToQueue = async (song: any) => {
        try {
            // await api.post('/jukebox/queue', { song_id: song.id, device_id: 'CURRENT_DEVICE_ID' });
            navigation.goBack();
        } catch (error) {
            console.error('Failed to add song');
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.item} onPress={() => addToQueue(item)}>
            <View style={styles.iconBox}>
                <Icon name="music-note" size={24} color="#888" />
            </View>
            <View style={styles.info}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.artist}>{item.artist}</Text>
            </View>
            <Icon name="plus-circle-outline" size={28} color="#e91e63" />
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <TextInput
                    style={styles.input}
                    placeholder="Şarkı veya sanatçı ara..."
                    placeholderTextColor="#888"
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={searchSongs}
                    autoFocus
                />
                <TouchableOpacity onPress={searchSongs}>
                    <Icon name="magnify" size={24} color="#e91e63" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color="#e91e63" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={results}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => item.id || index.toString()}
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
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    input: {
        flex: 1,
        height: 40,
        backgroundColor: '#2a2a2a',
        borderRadius: 20,
        paddingHorizontal: 20,
        marginHorizontal: 15,
        color: '#fff',
    },
    list: {
        padding: 15,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: {
        flex: 1,
        marginLeft: 15,
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    artist: {
        color: '#888',
        fontSize: 14,
    },
});
