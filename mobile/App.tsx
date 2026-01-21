import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TrackPlayer, { Capability } from 'react-native-track-player';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
    useEffect(() => {
        // Initialize TrackPlayer
        const setupPlayer = async () => {
            try {
                await TrackPlayer.setupPlayer();
                await TrackPlayer.updateOptions({
                    capabilities: [
                        Capability.Play,
                        Capability.Pause,
                        Capability.SkipToNext,
                        Capability.SkipToPrevious,
                    ],
                    compactCapabilities: [
                        Capability.Play,
                        Capability.Pause,
                    ],
                });
            } catch (error) {
                console.log('Player already setup or failed', error);
            }
        };

        setupPlayer();
    }, []);

    return (
        <SafeAreaProvider>
            <NavigationContainer>
                <RootNavigator />
            </NavigationContainer>
        </SafeAreaProvider>
    );
}
