/** @type {import('next').NextConfig} */

import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  sw: "service-worker.js",
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  publicExcludes: [
    "!**/*.map",
    "!payment-confirmed.gif",
    "!shop-freely-*.png",
  ],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "image-assets",
        expiration: {
          maxEntries: 120,
          maxAgeSeconds: 3 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.(css|js)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-assets",
        expiration: {
          maxEntries: 80,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\/api\/.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "www.facebook.com" },
      { protocol: "https", hostname: "www.twitter.com" },
      { protocol: "https", hostname: "www.instagram.com" },
      { protocol: "https", hostname: "duckduckgo.com" },
      { protocol: "https", hostname: "www.youtube.com" },
      { protocol: "https", hostname: "www.pinterest.com" },
      { protocol: "https", hostname: "www.linkedin.com" },
      { protocol: "https", hostname: "www.reddit.com" },
      { protocol: "https", hostname: "www.quora.com" },
      { protocol: "https", hostname: "www.wikipedia.org" },
    ],
  },
};

export default withPWA(nextConfig);
