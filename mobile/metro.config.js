const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const sharedPath = path.resolve(__dirname, '..', 'shared');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [sharedPath],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
