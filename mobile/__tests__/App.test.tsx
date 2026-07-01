/**
 * @format
 */

import 'react-native';
import React from 'react';

// Note: import explicitly to use the types shipped with jest.
import {it, jest} from '@jest/globals';

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    add: jest.fn(() => Promise.resolve()),
    getQueue: jest.fn(() => Promise.resolve([])),
    reset: jest.fn(() => Promise.resolve()),
    setupPlayer: jest.fn(() => Promise.resolve()),
    updateOptions: jest.fn(() => Promise.resolve()),
  },
  Capability: {
    Pause: 'pause',
    Play: 'play',
    PlayFromSearch: 'play-from-search',
    SeekTo: 'seek-to',
    SkipToNext: 'skip-to-next',
    SkipToPrevious: 'skip-to-previous',
    Stop: 'stop',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/navigation/RootNavigator', () => {
  const ReactRuntime = require('react');
  const {View} = require('react-native');

  return {
    RootNavigator: () =>
      ReactRuntime.createElement(View, {testID: 'root-navigator'}),
  };
});

jest.mock('../src/components/MiniPlayer', () => {
  const ReactRuntime = require('react');
  const {View} = require('react-native');

  return () => ReactRuntime.createElement(View, {testID: 'mini-player'});
});

import App from '../App';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
