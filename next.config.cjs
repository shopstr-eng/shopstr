/** @type {import('next').NextConfig} */

const withPWA = require("next-pwa");

const nextConfig = {
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
};

module.exports = withPWA(nextConfig);
