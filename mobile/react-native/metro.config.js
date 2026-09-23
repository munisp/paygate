// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// inlineRequires has been enabled by default since Expo SDK 50; set it
// explicitly so it cannot regress. Defers module evaluation until first use,
// reducing app startup time.
config.transformer.inlineRequires = true;

module.exports = config;
