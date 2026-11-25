/** @type {import('next').NextConfig} */

import withPWAInit, {
  runtimeCaching as defaultRuntimeCaching,
} from "@ducanh2912/next-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  sw: "service-worker.js",
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [
      {
        // Authenticated escrow responses contain private fulfillment details.
        // Workbox can cache responses regardless of HTTP Cache-Control.
        urlPattern:
          /^https?:\/\/[^/]+\/api\/lightning\/hodl-(?:orders|order-status|order|payout-reconcile)(?:\?|$)/,
        handler: "NetworkOnly",
      },
      ...defaultRuntimeCaching,
    ],
  },
});

const nextConfig = {
  bundlePagesRouterDependencies: true,
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./utils/lightning/lnd-proto/*.proto"],
  },
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
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
