import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TrackPlayer, { Capability } from 'react-native-track-player';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/theme/theme';
import { MetadataProvider } from './src/context/MetadataContext';
import { ChannelProvider } from './src/context/ChannelContext';

import MiniPlayer from './src/components/MiniPlayer';

function App(): React.JSX.Element {
  useEffect(() => {
    const setupPlayer = async () => {
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          // @ts-ignore - Property exists at runtime
          stopWithApp: true, // Stop playback when app is closed from background
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.Stop,
          ],
          compactCapabilities: [Capability.Play, Capability.Pause],
        });
      } catch (e) {
        console.log('Player already setup or error:', e);
      }
    };

    setupPlayer();

    return () => {
      // Clean up player when app unmounts (e.g. forced close)
      // reset() clears the queue, which should remove the notification
      TrackPlayer.reset();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <MetadataProvider>
        <ChannelProvider>
          <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
          <NavigationContainer>
            <RootNavigator />
            <MiniPlayer />
          </NavigationContainer>
        </ChannelProvider>
      </MetadataProvider>
    </SafeAreaProvider>
  );
}

export default App;
