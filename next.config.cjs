/** @type {import('next').NextConfig} */

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  sw: {
    swSrc: "./public/service-worker.js",
    swDest: "service-worker.js",
  },
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  pwa: {
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    runtimeCaching: [
      {
        // Cache static assets
        urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|ico|css|js)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 1 week
          },
        },
      },
      {
        // Cache API responses
        urlPattern: /^https:\/\/.*\/api\/.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-cache",
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 1 day
          },
        },
      },
      {
        // Cache other requests
        urlPattern: /^https?.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "general-cache",
          networkTimeoutSeconds: 15,
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 1 week
          },
        },
      },
    ],
  },
  images: {
    domains: [
      "www.google.com",
      "www.facebook.com",
      "www.twitter.com",
      "www.instagram.com",
      "duckduckgo.com",
      "www.youtube.com",
      "www.pinterest.com",
      "www.linkedin.com",
      "www.reddit.com",
      "www.quora.com",
      "www.wikipedia.org",
    ],
  },
};

module.exports = withPWA(nextConfig);
