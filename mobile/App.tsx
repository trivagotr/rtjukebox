import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TrackPlayer, { Capability } from 'react-native-track-player';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/theme/theme';
import { MetadataProvider } from './src/context/MetadataContext';
import { ChannelProvider } from './src/context/ChannelContext';
import { AuthProvider } from './src/context/AuthContext';

import MiniPlayer from './src/components/MiniPlayer';
import SplashScreen from './src/screens/SplashScreen';
import { RADIO_CHANNELS } from './src/data/radioChannels';

const linking: any = {
  prefixes: ['radiotedu://', 'https://radiotedu.com', 'https://radiotedu.com/jukebox'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Jukebox: 'jukebox/:deviceCode',
        },
      },
      Profile: 'profile',
      Auth: 'auth',
    },
  },
};

function App(): React.JSX.Element {
  const [showSplash, setShowSplash] = React.useState(true);
  const handleSplashFinish = React.useCallback(() => setShowSplash(false), []);

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
            Capability.SeekTo,
            Capability.PlayFromSearch,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious
          ],
          // @ts-ignore
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.Stop,
            Capability.PlayFromSearch,
          ],
          android: {
            // @ts-ignore
            alwaysPauseOnInterruption: true,
            // @ts-ignore
            appKilledPlaybackBehavior: 'stop-playback-and-remove-notification',
          },
        });

        // Pre-populate queue for Android Auto browsing
        const queue = await TrackPlayer.getQueue();
        if (queue.length === 0) {
          const tracks = RADIO_CHANNELS.map(c => ({
            id: c.id,
            url: c.streamUrl, // Use default stream for pre-load
            title: c.name,
            artist: c.description,
            artwork: 'https://radiotedu.com/logo.png',
            isLiveStream: true,
          }));
          await TrackPlayer.add(tracks);
        }
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
      <AuthProvider>
        <MetadataProvider>
          <ChannelProvider>
            <StatusBar
              barStyle="light-content"
              backgroundColor="transparent"
              translucent={true}
            />
            <NavigationContainer linking={linking}>
              <RootNavigator />
              <MiniPlayer />
            </NavigationContainer>
            {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
          </ChannelProvider>
        </MetadataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
