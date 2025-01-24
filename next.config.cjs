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
        urlPattern: /^https?.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "https-calls",
          networkTimeoutSeconds: 15,
          expiration: {
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 1 month
          },
          broadcastUpdate: {
            channelName: "update",
          },
          // Define your own headers here
          fetchOptions: {
            headers: {
              "Content-Security-Policy": "default-src 'self'",
            },
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
