// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const baseConfig = getDefaultConfig(__dirname);

const config = mergeConfig(baseConfig, {
  // Add any other Metro overrides here if needed
  // e.g. transformer, resolver, etc.
});

module.exports = withNativeWind(config, {
  input: './global.css',
});
