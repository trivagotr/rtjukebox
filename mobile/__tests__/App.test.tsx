/**
 * @format
 *
 * Smoke test: the App composes and renders without throwing.
 *
 * App.tsx runs heavy startup effects (i18n, track-player setup, podcast
 * preload, listening tracker, native car bridge) and renders a deep provider
 * tree gated on async i18n + privacy consent. We mock those side-effecting
 * modules so the render is deterministic and headless, then flush the startup
 * effects inside act() so nothing fires after the Jest environment tears down.
 */

import 'react-native';
import React from 'react';

import {expect, it, jest} from '@jest/globals';

jest.mock('react-native-track-player', () => {
  const trackPlayer = {
    setupPlayer: jest.fn(async () => undefined),
    updateOptions: jest.fn(async () => undefined),
    getQueue: jest.fn(async () => []),
    add: jest.fn(async () => undefined),
    reset: jest.fn(async () => undefined),
    getActiveTrack: jest.fn(async () => null),
    getActiveTrackIndex: jest.fn(async () => undefined),
    updateMetadataForTrack: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    skipToNext: jest.fn(async () => undefined),
    skipToPrevious: jest.fn(async () => undefined),
    addEventListener: jest.fn(() => ({remove: jest.fn()})),
  };

  return {
    __esModule: true,
    default: trackPlayer,
    Capability: {
      Play: 'play',
      Pause: 'pause',
      SkipToNext: 'skipToNext',
      SkipToPrevious: 'skipToPrevious',
      Stop: 'stop',
      SeekTo: 'seekTo',
      PlayFromSearch: 'playFromSearch',
    },
    State: {
      Playing: 'playing',
      Buffering: 'buffering',
      Connecting: 'connecting',
      Loading: 'loading',
    },
    Event: {
      PlaybackState: 'PlaybackState',
      PlaybackActiveTrackChanged: 'PlaybackActiveTrackChanged',
      PlaybackMetadataReceived: 'PlaybackMetadataReceived',
      RemotePlay: 'RemotePlay',
      RemotePause: 'RemotePause',
      RemoteStop: 'RemoteStop',
      RemoteNext: 'RemoteNext',
      RemotePrevious: 'RemotePrevious',
    },
    usePlaybackState: jest.fn(() => ({state: 'paused'})),
    useActiveTrack: jest.fn(() => null),
    useTrackPlayerEvents: jest.fn(),
  };
});

// Navigation tree leaves — kept trivial so the smoke test stays headless.
jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: () => null,
}));
jest.mock('../src/components/MiniPlayer', () => () => null);
jest.mock('../src/screens/SplashScreen', () => () => null);

// Context providers → passthroughs.
jest.mock('../src/context/MetadataContext', () => ({
  MetadataProvider: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../src/context/ChannelContext', () => ({
  ChannelProvider: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({children}: {children: React.ReactNode}) => children,
}));

// Consent: passthrough provider + a "decided + ready" state so ConsentGate
// renders the main app tree (not the consent screen) deterministically.
jest.mock('../src/privacy/ConsentContext', () => ({
  ConsentProvider: ({children}: {children: React.ReactNode}) => children,
  useConsent: () => ({
    consent: {
      decided: true,
      analytics: false,
      ageRange: undefined,
      gender: undefined,
    },
    ready: true,
    saveConsent: jest.fn(),
    withdrawAll: jest.fn(),
  }),
}));

// Startup side-effects → no-ops (no network, native modules or timers).
jest.mock('../src/i18n', () => ({initI18n: jest.fn(async () => undefined)}));
jest.mock('../src/services/podcastService', () => ({
  fetchPodcasts: jest.fn(async () => ({items: []})),
}));
jest.mock('../src/services/playbackQueue', () => ({
  ensureBrowsableQueue: jest.fn(async () => undefined),
  setCachedPodcasts: jest.fn(),
}));
jest.mock('../src/services/listeningTracker', () => ({
  startListeningTracker: jest.fn(),
}));
jest.mock('../src/services/carBridge', () => ({
  initCarBridge: jest.fn(),
  pushCarCatalog: jest.fn(),
}));
jest.mock('../src/services/analyticsService', () => ({
  Analytics: {appOpen: jest.fn()},
  setAnalyticsConsent: jest.fn(),
}));

import App from '../App';

// Note: test renderer must be required after react-native.
import renderer, {act} from 'react-test-renderer';

it('renders correctly', async () => {
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  // Flush the async startup effects (i18n ready + player setup) so the full
  // provider tree renders and nothing updates after teardown.
  await act(async () => {});

  expect(tree).toBeTruthy();

  await act(async () => {
    tree?.unmount();
  });
});
