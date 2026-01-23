import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Dimensions, Image, ImageBackground, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { State, usePlaybackState, useActiveTrack } from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING } from '../theme/theme';
import { RADIO_CHANNELS, RadioChannel } from '../data/radioChannels';
import { useMetadata } from '../context/MetadataContext';
import { useChannels } from '../context/ChannelContext';
// import { checkStreamAvailability } from '../utils/api'; // Moved to Context
import GlobalHeader from '../components/GlobalHeader';
import PageTransition from '../components/PageTransition';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.28;

const RadioScreen = () => {
    const navigation = useNavigation<any>();
    const playbackState = usePlaybackState();
    const activeTrack = useActiveTrack();
    const { metadata, clearMetadata } = useMetadata();
    const { activeChannels, isChecking } = useChannels();
    const [selectedChannel, setSelectedChannel] = useState<RadioChannel>(RADIO_CHANNELS[0]);
    const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

    // Initialize selectedChannel when channels are loaded
    useEffect(() => {
        if (!isChecking && activeChannels.length > 0) {
            // If current selection is not in active list (e.g. initial load), switch to first active
            const isCurrentActive = activeChannels.find(c => c.id === selectedChannel.id);
            if (!isCurrentActive) {
                console.log('[RadioScreen] Syncing selection with active channels provided by Context.');
                setSelectedChannel(activeChannels[0]);
            }
        }
    }, [activeChannels, isChecking]);

    // Quality selection: 'low' | 'medium' | 'high'
    const [streamQuality, setStreamQuality] = useState<'low' | 'medium' | 'high'>('high');

    // Voting system (placeholder - backend integration later)
    const [currentVote, setCurrentVote] = useState<'up' | 'down' | null>(null);

    const state = playbackState?.state;
    const isPlaying = state === State.Playing && currentPlayingId === selectedChannel.id;
    const isBuffering = (state === State.Buffering || state === State.Loading) && currentPlayingId === selectedChannel.id;

    // Layout Animation Setup
    useEffect(() => {
        if (Platform.OS === 'android') {
            if (UIManager.setLayoutAnimationEnabledExperimental) {
                UIManager.setLayoutAnimationEnabledExperimental(true);
            }
        }
    }, []);

    // Sync channel selection with active track
    useEffect(() => {
        if (activeTrack && activeTrack.id && activeTrack.id !== selectedChannel.id) {
            const channel = activeChannels.find(c => c.id === activeTrack.id);
            if (channel) setSelectedChannel(channel);
        }
    }, [activeTrack?.id, activeChannels]);

    const playChannel = async (channel: RadioChannel, qualityOverride?: 'low' | 'medium' | 'high') => {
        const isQualitySwitch = channel.id === selectedChannel.id && qualityOverride && qualityOverride !== streamQuality;

        setSelectedChannel(channel);
        if (!isQualitySwitch) {
            clearMetadata(); // Clear old metadata ONLY when switching channels
        }

        let url = channel.streamUrl;
        if (channel.streams) {
            const quality = qualityOverride || streamQuality;
            if (quality === 'low' && channel.streams.low) url = channel.streams.low;
            else if (quality === 'medium' && channel.streams.medium) url = channel.streams.medium;
            else if (quality === 'high' && channel.streams.high) url = channel.streams.high;
        }

        const trackObject = {
            id: channel.id,
            url: url,
            title: channel.name,
            artist: channel.description,
            artwork: 'https://radiotedu.com/logo.png',
            isLiveStream: true,
        };

        if (isQualitySwitch) {
            // OPTIMIZATION: "Queue & Skip" for gapless-like transition
            // 1. Add new quality stream to the end of queue
            await TrackPlayer.add(trackObject);
            // 2. Skip to it immediately
            await TrackPlayer.skipToNext();
            // 3. (Optional) We could cleanup the old track later, but simpler is safer for now.
        } else {
            // Standard Full Reset for new channel
            await TrackPlayer.reset();
            await TrackPlayer.add(trackObject);
            await TrackPlayer.play();
        }

        setCurrentPlayingId(channel.id);
    };

    const togglePlayback = async () => {
        const currentState = await TrackPlayer.getState();
        if (currentState === State.Playing) {
            await TrackPlayer.pause();
        } else {
            await playChannel(selectedChannel);
        }
    };

    const selectChannel = (channel: RadioChannel) => {
        // Always play when channel is selected
        playChannel(channel);
    };

    // Skip to next channel
    const skipToNextChannel = () => {
        const currentIndex = activeChannels.findIndex(c => c.id === selectedChannel.id);
        const nextIndex = (currentIndex + 1) % activeChannels.length;
        const nextChannel = activeChannels[nextIndex];
        playChannel(nextChannel);
    };

    // Skip to previous channel
    const skipToPreviousChannel = () => {
        const currentIndex = activeChannels.findIndex(c => c.id === selectedChannel.id);
        const prevIndex = currentIndex === 0 ? activeChannels.length - 1 : currentIndex - 1;
        const prevChannel = activeChannels[prevIndex];
        playChannel(prevChannel);
    };

    const cycleQuality = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        // Calculate next quality
        let nextQuality: 'low' | 'medium' | 'high';
        if (streamQuality === 'high') nextQuality = 'low';
        else if (streamQuality === 'low') nextQuality = 'medium';
        else nextQuality = 'high';

        setStreamQuality(nextQuality);

        // If currently playing, restart with new quality
        if (isPlaying || (state === State.Buffering)) {
            playChannel(selectedChannel, nextQuality);
        }
    };

    // Use context metadata if available
    const displayTitle = metadata?.title || activeTrack?.title || selectedChannel.name;
    const displayArtist = metadata?.artist || activeTrack?.artist || selectedChannel.description;
    const displayArtwork = metadata?.artwork || activeTrack?.artwork;
    const hasArtwork = displayArtwork && displayArtwork !== 'https://radiotedu.com/logo.png';

    const getQualityProps = () => {
        switch (streamQuality) {
            case 'high': return {
                text: 'HQ • 320kbps',
                color: '#FFD700',
                borderColor: 'rgba(255, 215, 0, 0.5)',
                bg: 'rgba(255, 215, 0, 0.1)',
                icon: 'signal-cellular-3'
            };
            case 'medium': return {
                text: 'MQ • 128kbps',
                color: '#00BCD4',
                borderColor: 'rgba(0, 188, 212, 0.5)',
                bg: 'rgba(0, 188, 212, 0.1)',
                icon: 'signal-cellular-2'
            };
            default: return {
                text: 'LQ • 64kbps',
                color: '#B0BEC5',
                borderColor: 'rgba(176, 190, 197, 0.5)',
                bg: 'rgba(176, 190, 197, 0.1)',
                icon: 'signal-cellular-1'
            };
        }
    };

    const qProps = getQualityProps();

    const renderChannelItem = ({ item }: { item: RadioChannel }) => {
        const isActive = selectedChannel.id === item.id;
        const isChannelPlaying = currentPlayingId === item.id && state === State.Playing;

        return (
            <TouchableOpacity
                style={[styles.channelChip, isActive && { backgroundColor: item.color }]}
                onPress={() => selectChannel(item)}
                activeOpacity={0.7}
            >
                <View style={[styles.channelDot, { backgroundColor: isActive ? '#fff' : item.color }]} />
                <Text style={[styles.channelChipText, isActive && styles.channelChipTextActive]}>
                    {item.name}
                </Text>
                {isChannelPlaying && (
                    <Icon name="volume-high" size={14} color={isActive ? '#fff' : item.color} style={{ marginLeft: 4 }} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <PageTransition>
            <View style={styles.container}>
                {/* Background Gradient */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#121212' }]}>
                    {hasArtwork && (
                        <ImageBackground
                            source={{ uri: displayArtwork }}
                            style={styles.backgroundImage}
                            blurRadius={50}
                        >
                            <View style={styles.backgroundOverlay} />
                        </ImageBackground>
                    )}
                </View>

                {/* Loading Overlay */}
                {isChecking && (
                    <View style={styles.loadingOverlay}>
                        <Icon name="radio-tower" size={60} color={COLORS.primary} />
                        <Text style={styles.loadingText}>RadioTEDU</Text>
                        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
                        <Text style={styles.loadingSubtext}>Kanallar kontrol ediliyor...</Text>
                    </View>
                )}

                <SafeAreaView style={styles.safeArea}>
                    {/* Header */}
                    <GlobalHeader />

                    {/* Channel Logo Banner */}
                    <View style={styles.logoBanner}>
                        <Image
                            source={{ uri: selectedChannel.logo }}
                            style={styles.channelLogo}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Channel Chips */}
                    <View style={styles.channelSection}>
                        <FlatList
                            data={activeChannels}
                            renderItem={renderChannelItem}
                            keyExtractor={(item) => item.id}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.channelList}
                        />
                    </View>

                    {/* Main Player Area */}
                    <View style={styles.playerArea}>
                        {/* Artwork */}
                        <View style={styles.artworkContainer}>
                            {hasArtwork ? (
                                <Image source={{ uri: displayArtwork }} style={styles.artwork} />
                            ) : (
                                <Image
                                    source={{ uri: 'https://radiotedu.com/logo.png' }}
                                    style={styles.artwork}
                                />
                            )}
                        </View>

                        {/* Track Info */}
                        <View style={styles.trackInfo}>
                            <Text style={styles.trackTitle} numberOfLines={1}>{displayTitle}</Text>
                            <Text style={styles.trackArtist} numberOfLines={1}>{displayArtist}</Text>
                        </View>

                        {/* Badges Row: Live + Hi-Qu */}
                        <View style={styles.badgesRow}>
                            <View style={styles.liveBadge}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>LIVE</Text>
                            </View>

                            <TouchableOpacity
                                onPress={cycleQuality}
                                style={[styles.techBadge, {
                                    borderColor: qProps.borderColor,
                                    backgroundColor: qProps.bg
                                }]}
                                activeOpacity={0.7}
                            >
                                <Icon name={qProps.icon} size={14} color={qProps.color} style={{ marginRight: 6 }} />
                                <Text style={[styles.techBadgeText, { color: qProps.color }]}>
                                    {qProps.text}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Voting Buttons */}
                        <View style={styles.votingRow}>
                            <TouchableOpacity
                                style={[styles.voteButton, currentVote === 'down' && styles.voteButtonActive]}
                                onPress={() => setCurrentVote(currentVote === 'down' ? null : 'down')}
                            >
                                <Icon
                                    name={currentVote === 'down' ? "thumb-down" : "thumb-down-outline"}
                                    size={24}
                                    color={currentVote === 'down' ? COLORS.primary : '#888'}
                                />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.voteButton, currentVote === 'up' && styles.voteButtonActive]}
                                onPress={() => setCurrentVote(currentVote === 'up' ? null : 'up')}
                            >
                                <Icon
                                    name={currentVote === 'up' ? "thumb-up" : "thumb-up-outline"}
                                    size={24}
                                    color={currentVote === 'up' ? '#4CAF50' : '#888'}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Controls */}
                        <View style={styles.controls}>
                            <TouchableOpacity style={styles.controlButton} onPress={skipToPreviousChannel}>
                                <Icon name="skip-previous" size={36} color="#b3b3b3" />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
                                {isBuffering ? (
                                    <ActivityIndicator color="#fff" size="large" />
                                ) : (
                                    <Icon name={isPlaying ? "pause" : "play"} size={36} color="#fff" />
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.controlButton} onPress={skipToNextChannel}>
                                <Icon name="skip-next" size={36} color="#b3b3b3" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        </PageTransition >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backgroundImage: {
        flex: 1,
        opacity: 0.4,
    },
    backgroundOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8, // Reduced from 16
    },
    headerTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    logoBanner: {
        alignItems: 'center',
        paddingVertical: 8, // Reduced from 12
        paddingHorizontal: 16, // Reduced from 32
    },
    channelLogo: {
        width: width - 64,
        height: 48, // Reduced from 60
    },
    channelSection: {
        marginBottom: 16, // Reduced from 24
    },
    channelList: {
        paddingHorizontal: 16,
        gap: 8,
    },
    channelChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#282828',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
    },
    channelChipActive: {
        backgroundColor: COLORS.primary,
    },
    channelDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    channelChipText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },
    channelChipTextActive: {
        color: '#000',
        fontWeight: '600',
    },
    playerArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    artworkContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 10,
        marginBottom: 20, // Reduced from 24
    },
    artwork: {
        width: width - 120,
        height: width - 120,
        borderRadius: 8,
    },
    placeholderArtwork: {
        backgroundColor: '#282828',
        justifyContent: 'center',
        alignItems: 'center',
    },
    trackInfo: {
        alignItems: 'center',
        marginBottom: 8, // Reduced from 12
        width: '100%',
    },
    trackTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    trackArtist: {
        color: '#b3b3b3',
        fontSize: 16,
        marginTop: 4,
        textAlign: 'center',
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16, // Reduced from 20
        gap: 12,
    },
    techBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6, // Boxier tech look
        borderWidth: 1,
    },
    techBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', // Tech font
    },
    votingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        marginBottom: 20, // Reduced from 24
    },
    voteButton: {
        padding: 12,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    voteButtonActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E31E24',
        marginRight: 6,
    },
    liveText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
    },
    controlButton: {
        padding: 8,
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    loadingText: {
        color: COLORS.primary,
        fontSize: 28,
        fontWeight: 'bold',
        marginTop: 16,
        letterSpacing: 2,
    },
    loadingSubtext: {
        color: COLORS.textMuted,
        fontSize: 14,
        marginTop: 12,
    },
});

export default RadioScreen;
