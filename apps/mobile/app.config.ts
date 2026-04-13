import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Milk Market Seller",
  slug: "milk-market-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "milkmarket",
  userInterfaceStyle: "automatic",
  plugins: [
    "expo-router",
    [
      "expo-dev-client",
      {
        launchMode: "most-recent",
      },
    ],
    "expo-secure-store",
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.milkmarket.mobile",
  },
  android: {
    package: "com.milkmarket.mobile",
  },
  web: {
    bundler: "metro",
  },
};

export default config;
