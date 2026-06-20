/* eslint-env jest */
/**
 * Global Jest setup for the RadioTEDU mobile app.
 *
 * Provides JS mocks for native modules that are otherwise `null` under the
 * `react-native` Jest preset, so suites that import the real service/app graph
 * (e.g. App.test.tsx -> playbackQueue -> AsyncStorage) can run headlessly.
 */

// Official AsyncStorage mock shipped with the package.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// react-native-safe-area-context has no usable native context under Jest;
// provide a static-metrics mock so components wrapped in SafeAreaProvider render.
jest.mock('react-native-safe-area-context', () => {
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  const frame = {x: 0, y: 0, width: 390, height: 844};
  const React = require('react');
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaConsumer: ({children}) => children(inset),
    SafeAreaView: ({children}) => React.createElement(React.Fragment, null, children),
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: {insets: inset, frame},
  };
});
