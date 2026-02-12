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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
      },
      {
        protocol: "https",
        hostname: "www.facebook.com",
      },
      {
        protocol: "https",
        hostname: "www.twitter.com",
      },
      {
        protocol: "https",
        hostname: "www.instagram.com",
      },
      {
        protocol: "https",
        hostname: "duckduckgo.com",
      },
      {
        protocol: "https",
        hostname: "www.youtube.com",
      },
      {
        protocol: "https",
        hostname: "www.pinterest.com",
      },
      {
        protocol: "https",
        hostname: "www.linkedin.com",
      },
      {
        protocol: "https",
        hostname: "www.reddit.com",
      },
      {
        protocol: "https",
        hostname: "www.quora.com",
      },
      {
        protocol: "https",
        hostname: "www.wikipedia.org",
      },
      {
        protocol: "https",
        hostname: "cdn.nostrcheck.me",
      },
      {
        protocol: "https",
        hostname: "blossom.primal.net",
        pathname: "/**",
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
