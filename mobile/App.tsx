import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TrackPlayer, { Capability } from 'react-native-track-player';
import { RootNavigator } from './src/navigation/RootNavigator';
import { MetadataProvider } from './src/context/MetadataContext';
import { ChannelProvider } from './src/context/ChannelContext';
import { AuthProvider } from './src/context/AuthContext';

import MiniPlayer from './src/components/MiniPlayer';
import SplashScreen from './src/screens/SplashScreen';
import {
  ensureBrowsableQueue,
  setCachedPodcasts,
} from './src/services/playbackQueue';
import { DEFAULT_STREAM_QUALITY } from './src/services/config';
import { fetchPodcasts } from './src/services/podcastService';
import { initI18n } from './src/i18n';
import { ConsentProvider, useConsent } from './src/privacy/ConsentContext';
import ConsentScreen from './src/screens/ConsentScreen';
import { Analytics, setAnalyticsConsent } from './src/services/analyticsService';
import { startListeningTracker } from './src/services/listeningTracker';
import { initCarBridge, pushCarCatalog } from './src/services/carBridge';

const linking: any = {
  prefixes: ['radiotedu://', 'https://radiotedu.com', 'https://radiotedu.com/jukebox'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Jukebox: 'jukebox/:deviceCode',
        },
      },
      Events: 'events/qr/:qrCode',
      Profile: 'profile',
      Focus: 'focus',
      Language: 'language',
      Auth: 'auth',
    },
  },
};

function App(): React.JSX.Element {
  const [showSplash, setShowSplash] = React.useState(true);
  const [i18nReady, setI18nReady] = React.useState(false);
  const handleSplashFinish = React.useCallback(() => setShowSplash(false), []);

  // Resolve the saved/device language before rendering UI to avoid a flash of
  // the wrong language.
  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

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

        // Pre-load recent podcasts so they appear in the Android Auto / CarPlay
        // browse list alongside the live channels (best-effort - never blocks
        // radio from loading if the podcast API is unavailable).
        try {
          const {items} = await fetchPodcasts(1);
          setCachedPodcasts(items);
          pushCarCatalog(items); // include podcasts in the car browse tree
        } catch (podcastError) {
          console.log('Podcast preload skipped:', podcastError);
        }

        // Build the browsable queue (channels + podcasts) for the car. Uses the
        // shared helper so the in-app player and the car stay in sync.
        await ensureBrowsableQueue(DEFAULT_STREAM_QUALITY);

        // Measure listening minutes (only emitted if the user consented).
        startListeningTracker();

        // Wire the native Android Auto / Automotive car browser (Android only).
        initCarBridge();
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

  if (!i18nReady) {
    return <SafeAreaProvider />;
  }

  return (
    <SafeAreaProvider>
      <ConsentProvider>
        <AuthProvider>
          <MetadataProvider>
            <ChannelProvider>
              <StatusBar
                barStyle="light-content"
                backgroundColor="transparent"
                translucent={true}
              />
              <ConsentGate
                showSplash={showSplash}
                onSplashFinish={handleSplashFinish}
              />
            </ChannelProvider>
          </MetadataProvider>
        </AuthProvider>
      </ConsentProvider>
    </SafeAreaProvider>
  );
}

/**
 * Gates the app behind the first-launch privacy consent, and syncs the user's
 * consent choice into the analytics layer.
 */
function ConsentGate({
  showSplash,
  onSplashFinish,
}: {
  showSplash: boolean;
  onSplashFinish: () => void;
}): React.JSX.Element | null {
  const { consent, ready } = useConsent();

  useEffect(() => {
    if (ready && consent.decided) {
      setAnalyticsConsent(consent.analytics, {
        ageRange: consent.ageRange,
        gender: consent.gender,
      });
      Analytics.appOpen();
    }
  }, [
    ready,
    consent.decided,
    consent.analytics,
    consent.ageRange,
    consent.gender,
  ]);

  if (!ready) {
    return null;
  }

  // First launch (or after a policy-version bump): ask for consent before
  // anything else runs.
  if (!consent.decided) {
    return <ConsentScreen />;
  }

  return (
    <>
      <NavigationContainer linking={linking}>
        <RootNavigator />
        <MiniPlayer />
      </NavigationContainer>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
    </>
  );
}

export default App;
