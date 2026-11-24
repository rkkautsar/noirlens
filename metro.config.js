const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The front-coded English vocabulary is a bundled text asset.
config.resolver.assetExts.push('txt');

module.exports = config;
