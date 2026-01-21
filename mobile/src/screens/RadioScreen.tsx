import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { State, usePlaybackState } from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../services/api';

export default function RadioScreen() {
    const playbackState = usePlaybackState();
    const [isPlaying, setIsPlaying] = useState(false);
    const [metadata, setMetadata] = useState<any>(null);

    useEffect(() => {
        // Fetch stream info
        api.get('/radio/status').then(res => {
            setMetadata(res.data);
        });
    }, []);

    const togglePlayback = async () => {
        const currentState = await TrackPlayer.getState();

        if (currentState === State.Playing) {
            await TrackPlayer.pause();
            setIsPlaying(false);
        } else {
            // If not initialized or stopped
            await TrackPlayer.reset();
            await TrackPlayer.add({
                id: 'live-radio',
                url: metadata?.stream_url || 'https://stream.radiotedu.com/live',
                title: 'RadioTEDU Canlı',
                artist: 'RadioTEDU',
                artwork: 'https://radiotedu.com/logo.png',
                isLiveStream: true,
            });
            await TrackPlayer.play();
            setIsPlaying(true);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.artworkContainer}>
                    <View style={styles.artwork}>
                        <Icon name="radio-tower" size={80} color="#fff" />
                    </View>
                    <View style={styles.liveBadge}>
                        <Text style={styles.liveText}>CANLI</Text>
                    </View>
                </View>

                <View style={styles.infoContainer}>
                    <Text style={styles.stationName}>RadioTEDU</Text>
                    <Text style={styles.showName}>
                        {metadata ? metadata.current_show : 'Yükleniyor...'}
                    </Text>
                </View>

                <View style={styles.controls}>
                    <TouchableOpacity
                        style={styles.playButton}
                        onPress={togglePlayback}
                    >
                        {playbackState.state === State.Buffering ? (
                            <ActivityIndicator color="#000" size="large" />
                        ) : (
                            <Icon
                                name={isPlaying ? "pause" : "play"}
                                size={40}
                                color="#000"
                            />
                        )}
                    </TouchableOpacity>
                </View>

                {metadata && (
                    <Text style={styles.listenerCount}>
                        👥 {metadata.listeners_count} Dinleyici
                    </Text>
                )}
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
        padding: 20,
    },
    artworkContainer: {
        position: 'relative',
        marginBottom: 40,
    },
    artwork: {
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#e91e63',
    },
    liveBadge: {
        position: 'absolute',
        bottom: 0,
        alignSelf: 'center',
        backgroundColor: '#e91e63',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 10,
    },
    liveText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    infoContainer: {
        alignItems: 'center',
        marginBottom: 50,
    },
    stationName: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    showName: {
        color: '#aaa',
        fontSize: 18,
    },
    controls: {
        marginBottom: 30,
    },
    playButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
    },
    listenerCount: {
        color: '#666',
        fontSize: 14,
    },
});
