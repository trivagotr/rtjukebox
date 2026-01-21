import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { State, Event, usePlaybackState } from 'react-native-track-player';
import QRCode from 'react-native-qrcode-svg';
import io, { Socket } from 'socket.io-client';
import api from './services/api';

// Device config - bu cihaza özel, kurulum sırasında ayarlanır
const DEVICE_CODE = 'CAFE-001';
const API_URL = 'http://192.168.1.100:3000'; // Sunucu IP

interface Song {
    id: string;
    song_id: string;
    title: string;
    artist: string;
    cover_url: string;
    file_url: string;
    added_by_name: string;
    upvotes: number;
    downvotes: number;
}

interface QueueData {
    now_playing: Song | null;
    queue: Song[];
}

export default function App() {
    const [device, setDevice] = useState<any>(null);
    const [queueData, setQueueData] = useState<QueueData>({ now_playing: null, queue: [] });
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const playbackState = usePlaybackState();

    useEffect(() => {
        initializeKiosk();
        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    // Playback state değişikliklerini izle
    useEffect(() => {
        if (playbackState.state === State.Ended) {
            // Şarkı bitti, sıradakini çal
            playNextFromQueue();
        }
    }, [playbackState.state]);

    const initializeKiosk = async () => {
        try {
            // TrackPlayer'ı hazırla
            await TrackPlayer.setupPlayer();
            await TrackPlayer.updateOptions({
                capabilities: [],
                compactCapabilities: [],
            });

            // Sunucuya kayıt ol
            const res = await api.post('/jukebox/kiosk/register', { device_code: DEVICE_CODE });
            setDevice(res.data.device);

            // Socket bağlantısı
            const socket = io(API_URL);
            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('Socket connected');
                socket.emit('join_device', res.data.device.id);
            });

            socket.on('queue_updated', (data: QueueData) => {
                setQueueData(data);

                // Eğer hiçbir şey çalmıyorsa ve kuyrukta şarkı varsa, çalmaya başla
                checkAndPlayNext(data);
            });

            // İlk kuyruk yüklemesi
            const qRes = await api.get(`/jukebox/queue/${res.data.device.id}`);
            setQueueData(qRes.data);
            checkAndPlayNext(qRes.data);

        } catch (err: any) {
            console.error('Kiosk Init Error:', err);
            setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.');
        }
    };

    const checkAndPlayNext = async (data: QueueData) => {
        const currentState = await TrackPlayer.getState();
        if (currentState !== State.Playing && currentState !== State.Buffering) {
            if (data.queue.length > 0 && !data.now_playing) {
                playSong(data.queue[0]);
            }
        }
    };

    const playNextFromQueue = async () => {
        if (queueData.queue.length > 0) {
            playSong(queueData.queue[0]);
        } else {
            setIsPlaying(false);
            // Sunucuya bildir
            if (device) {
                await api.post('/jukebox/kiosk/now-playing', { device_id: device.id, song_id: null });
            }
        }
    };

    const playSong = async (song: Song) => {
        try {
            await TrackPlayer.reset();
            await TrackPlayer.add({
                id: song.song_id,
                url: song.file_url,
                title: song.title,
                artist: song.artist,
                artwork: song.cover_url,
            });
            await TrackPlayer.play();
            setIsPlaying(true);

            // Sunucuya bildir
            if (device) {
                await api.post('/jukebox/kiosk/now-playing', {
                    device_id: device.id,
                    song_id: song.song_id
                });
            }
        } catch (err) {
            console.error('Playback error:', err);
        }
    };

    // Loading screen
    if (!device) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#e91e63" />
                <Text style={styles.loadingText}>
                    {error || 'Kiosk başlatılıyor...'}
                </Text>
            </View>
        );
    }

    const { width } = Dimensions.get('window');
    const qrSize = Math.min(width * 0.25, 200);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.deviceName}>{device.name || DEVICE_CODE}</Text>
                <Text style={styles.location}>{device.location}</Text>
            </View>

            <View style={styles.mainContent}>
                {/* Now Playing */}
                <View style={styles.nowPlayingSection}>
                    {queueData.now_playing ? (
                        <>
                            <Image
                                source={{ uri: queueData.now_playing.cover_url }}
                                style={styles.albumArt}
                            />
                            <View style={styles.songInfo}>
                                <Text style={styles.nowPlayingLabel}>ŞU AN ÇALIYOR</Text>
                                <Text style={styles.songTitle}>{queueData.now_playing.title}</Text>
                                <Text style={styles.songArtist}>{queueData.now_playing.artist}</Text>
                                <Text style={styles.requester}>
                                    İsteyen: {queueData.now_playing.added_by_name}
                                </Text>
                            </View>
                        </>
                    ) : (
                        <View style={styles.idleContainer}>
                            <Text style={styles.idleText}>🎵</Text>
                            <Text style={styles.idleMessage}>Sırada şarkı yok</Text>
                            <Text style={styles.idleSubtext}>QR kodu okutarak şarkı ekleyin!</Text>
                        </View>
                    )}
                </View>

                {/* Right Side: QR + Queue */}
                <View style={styles.sidePanel}>
                    {/* QR Code */}
                    <View style={styles.qrSection}>
                        <QRCode
                            value={`radiotedu://jukebox/${DEVICE_CODE}`}
                            size={qrSize}
                            backgroundColor="#fff"
                        />
                        <Text style={styles.qrInstruction}>Şarkı eklemek için tarayın</Text>
                    </View>

                    {/* Queue Preview */}
                    <View style={styles.queueSection}>
                        <Text style={styles.queueTitle}>Sıradakiler</Text>
                        {queueData.queue.length === 0 ? (
                            <Text style={styles.emptyQueue}>Kuyruk boş</Text>
                        ) : (
                            queueData.queue.slice(0, 5).map((song: Song, index: number) => (
                                <View key={song.id} style={styles.queueItem}>
                                    <Text style={styles.queuePosition}>{index + 1}</Text>
                                    <View style={styles.queueSongInfo}>
                                        <Text style={styles.queueSongTitle} numberOfLines={1}>
                                            {song.title}
                                        </Text>
                                        <Text style={styles.queueSongArtist} numberOfLines={1}>
                                            {song.artist}
                                        </Text>
                                    </View>
                                    <Text style={styles.queueVotes}>
                                        {song.upvotes - song.downvotes}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 20,
        fontSize: 18,
    },
    header: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    deviceName: {
        color: '#e91e63',
        fontSize: 28,
        fontWeight: 'bold',
    },
    location: {
        color: '#888',
        fontSize: 16,
    },
    mainContent: {
        flex: 1,
        flexDirection: 'row',
    },
    nowPlayingSection: {
        flex: 2,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    albumArt: {
        width: 350,
        height: 350,
        borderRadius: 20,
        marginBottom: 30,
    },
    songInfo: {
        alignItems: 'center',
    },
    nowPlayingLabel: {
        color: '#e91e63',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    songTitle: {
        color: '#fff',
        fontSize: 36,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    songArtist: {
        color: '#aaa',
        fontSize: 24,
        marginTop: 10,
    },
    requester: {
        color: '#4CAF50',
        fontSize: 18,
        marginTop: 15,
    },
    idleContainer: {
        alignItems: 'center',
    },
    idleText: {
        fontSize: 80,
        marginBottom: 20,
    },
    idleMessage: {
        color: '#666',
        fontSize: 28,
    },
    idleSubtext: {
        color: '#444',
        fontSize: 18,
        marginTop: 10,
    },
    sidePanel: {
        flex: 1,
        backgroundColor: '#111',
        padding: 20,
    },
    qrSection: {
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        marginBottom: 20,
    },
    qrInstruction: {
        color: '#fff',
        marginTop: 15,
        fontSize: 14,
    },
    queueSection: {
        flex: 1,
    },
    queueTitle: {
        color: '#888',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    emptyQueue: {
        color: '#444',
        fontStyle: 'italic',
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    queuePosition: {
        color: '#666',
        fontSize: 18,
        fontWeight: 'bold',
        width: 30,
    },
    queueSongInfo: {
        flex: 1,
    },
    queueSongTitle: {
        color: '#fff',
        fontSize: 16,
    },
    queueSongArtist: {
        color: '#888',
        fontSize: 14,
    },
    queueVotes: {
        color: '#4CAF50',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
