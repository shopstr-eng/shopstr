const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Expo SDK 55+ handles workspace package resolution automatically.
module.exports = config;
