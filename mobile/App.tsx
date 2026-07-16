import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  InteractionManager,
  StatusBar,
  View,
} from 'react-native';
import { NavigationContainer, getStateFromPath } from '@react-navigation/native';
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
import {createRunOnceWhenActive} from './src/services/playerForegroundBootstrap';
import { initI18n } from './src/i18n';
import { ConsentProvider, useConsent } from './src/privacy/ConsentContext';
import ConsentScreen from './src/screens/ConsentScreen';
import { Analytics, setAnalyticsConsent } from './src/services/analyticsService';
import { startListeningTracker } from './src/services/listeningTracker';
import { initCarBridge, pushCarCatalog } from './src/services/carBridge';
import {normalizeJukeLocalAppPath} from './src/services/jukeLocalWebViewService';

const linking: any = {
  prefixes: ['radiotedu://', 'https://radiotedu.com', 'https://radiotedu.com/jukebox'],
  getStateFromPath: (path: string, options: any) =>
    getStateFromPath(normalizeJukeLocalAppPath(path), options),
  config: {
    screens: {
      MainTabs: {
        screens: {
          Jukebox: 'jukebox/:deviceCode?',
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
    let playerReady = false;
    const setupPlayer = async () => {
      if (!playerReady) {
        await TrackPlayer.setupPlayer();
        playerReady = true;
      }

      try {
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
        console.log('Player post-setup initialization failed:', e);
        throw e;
      }
    };

    const runner = createRunOnceWhenActive(setupPlayer, error => {
      console.log('Player setup deferred or failed:', error);
    });
    const scheduleSetup = (state: typeof AppState.currentState) => {
      if (state !== 'active') {
        runner.handleAppStateChange(state);
        return;
      }

      InteractionManager.runAfterInteractions(() => {
        runner.handleAppStateChange(AppState.currentState);
      });
    };
    const appStateSubscription = AppState.addEventListener(
      'change',
      scheduleSetup,
    );
    const initialSetupTask = InteractionManager.runAfterInteractions(() => {
      runner.handleAppStateChange(AppState.currentState);
    });

    return () => {
      runner.cancel();
      appStateSubscription.remove();
      initialSetupTask.cancel();
      if (playerReady) {
        // reset() clears the queue, which should remove the notification.
        void TrackPlayer.reset();
      }
    };
  }, []);

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
                i18nReady={i18nReady}
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
  i18nReady,
  showSplash,
  onSplashFinish,
}: {
  i18nReady: boolean;
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

  let content: React.JSX.Element;

  if (!ready) {
    content = (
      <View style={{flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator color="#E31E24" size="large" />
      </View>
    );
  } else if (!consent.decided) {
    // First launch (or after a policy-version bump): ask for consent before
    // anything else runs.
    content = <ConsentScreen />;
  } else {
    content = (
      <NavigationContainer linking={linking}>
        <RootNavigator />
        <MiniPlayer />
      </NavigationContainer>
    );
  }

  return (
    <>
      {content}
      {showSplash && (
        <SplashScreen
          ready={i18nReady && ready}
          onFinish={onSplashFinish}
        />
      )}
    </>
  );
}

export default App;
