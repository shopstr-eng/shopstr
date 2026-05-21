/** @type {import('next').NextConfig} */

import withPWAInit from "@ducanh2912/next-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    // Page navigations (HTML) — NEVER cache. A stale HTML doc on a
    // seller's custom domain is what bricked the storefront for 7 days.
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkOnly",
    },
    // Storefront slug/domain lookup — NEVER cache. A stale negative
    // (404 before the seller's domain was verified, or before a slug
    // was registered) would otherwise stick around for 24h and make
    // the custom domain look permanently misconfigured.
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/storefront/"),
      handler: "NetworkOnly",
    },
    // Other APIs — short NetworkFirst, do NOT keep for a day.
    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/storefront/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60,
        },
      },
    },
    // Static assets by extension — CacheFirst is fine.
    {
      urlPattern:
        /\.(?:png|jpg|jpeg|svg|gif|ico|webp|avif|css|js|mjs|woff2?|ttf)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
  ],
  sw: {
    swSrc: "./public/service-worker.js",
    swDest: "service-worker.js",
  },
});

const nextConfig = {
  allowedDevOrigins: [
    "e9ba601a-36d6-4d29-ba29-e886d75befcb-00-o2i19us8bom3.picard.replit.dev",
  ],
  bundlePagesRouterDependencies: true,
  output: "standalone",
  // Required so Next.js's file tracer walks up to the pnpm workspace root
  // and bundles the workspace packages + their deps into .next/standalone.
  outputFileTracingRoot: path.join(__dirname, "."),
  reactStrictMode: true,
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@milk-market/domain",
    "@milk-market/nostr",
    "@milk-market/api-client",
  ],
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/stall/:slug/listing/:productSlug",
          destination: "/listing/:productSlug?_sf=:slug",
        },
        {
          source: "/stall/:slug/cart",
          destination: "/cart?_sf=:slug",
        },
      ],
      afterFiles: [
        {
          source: "/sitemap.xml",
          destination: "/api/sitemap.xml",
        },
      ],
      fallback: [],
    };
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
