/**
 * @format
 */

import 'react-native';
import React from 'react';

// Note: import explicitly to use the types shipped with jest.
import {it, jest} from '@jest/globals';

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

jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: () => {
    const mockReact = require('react');
    const {Text: MockText} = require('react-native');
    return mockReact.createElement(MockText, null, 'RootNavigator');
  },
}));

jest.mock('../src/components/MiniPlayer', () => () => null);

jest.mock('../src/screens/SplashScreen', () => () => null);

jest.mock('../src/context/MetadataContext', () => ({
  MetadataProvider: ({children}: {children: React.ReactNode}) => children,
}));

jest.mock('../src/context/ChannelContext', () => ({
  ChannelProvider: ({children}: {children: React.ReactNode}) => children,
}));

jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({children}: {children: React.ReactNode}) => children,
}));

import App from '../App';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
