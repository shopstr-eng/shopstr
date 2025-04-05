/** @type {import('next').NextConfig} */

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
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
});

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["@tremor/react"],
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
      "i.imgur.com",
      "imgur.com",
      "i.ibb.co",
      "ibb.co",
    ],
  },
  compiler: {
    styledComponents: true,
  },
  webpack: (config, { dev, isServer }) => {
<<<<<<< HEAD
    if (dev && !isServer) {
      config.watchOptions = {
        ignored: ['**/.git/**', '**/node_modules/**'],
        aggregateTimeout: 100,  // Reduced from 300 to 100
        poll: 500,  // Reduced from 1000 to 500
      };
      
      // Add hot module replacement settings
      config.optimization = {
        ...config.optimization,
        runtimeChunk: 'single',
      };
    }
=======
    // Fix for Fast Refresh issues
    if (dev) {
      config.watchOptions = {
        ignored: ['**/.git/**', '**/node_modules/**'],
        aggregateTimeout: 300,
        poll: 1000,
      };
    }
    
>>>>>>> 46133c3906daa13954ffc4467d4431ccca097568
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
      
<<<<<<< HEAD
=======
      // Fix for Headless UI issues
>>>>>>> 46133c3906daa13954ffc4467d4431ccca097568
      config.module.rules.push({
        test: /node_modules\/@headlessui\/react/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['next/babel'],
            plugins: [
              ['@babel/plugin-transform-runtime', { regenerator: true }],
            ],
          },
        },
      });
    }
<<<<<<< HEAD
=======
    
    // Fix for Fast Refresh issues with styled-components
    if (dev && !isServer) {
      config.module.rules.push({
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['next/babel'],
            plugins: [
              ['@babel/plugin-transform-runtime', { regenerator: true }],
            ],
          },
        },
      });
    }
    
>>>>>>> 46133c3906daa13954ffc4467d4431ccca097568
    return config;
  },
};

module.exports = withPWA(nextConfig);