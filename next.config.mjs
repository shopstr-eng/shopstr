/** @type {import('next').NextConfig} */

import withPWAInit from "@ducanh2912/next-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  sw: "service-worker.js",
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|ico|css|js)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60,
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
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "general-cache",
        networkTimeoutSeconds: 15,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
  ],
});

const nextConfig = {
  bundlePagesRouterDependencies: true,
  output: "standalone",
  // Pin the file tracer to this project root so Next.js bundles only what's
  // needed into .next/standalone (silences multi-lockfile warnings and keeps
  // the deployment image lean).
  outputFileTracingRoot: path.join(__dirname, "."),
  reactStrictMode: true,
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  poweredByHeader: false,
  turbopack: {},
  async rewrites() {
    return [
      {
        source: "/sitemap.xml",
        destination: "/api/sitemap.xml",
      },
      {
        source: "/robots.txt",
        destination: "/api/robots.txt",
      },
    ];
  },
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
