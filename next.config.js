/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
      config.output.environment = {
        ...config.output.environment,
        asyncFunction: true,
      };
    }

    if (isServer) {
      config.output.webassemblyModuleFilename =
        './../static/wasm/[modulehash].wasm';
    } else {
      config.output.webassemblyModuleFilename =
        'static/wasm/[modulehash].wasm';
    }

    config.experiments = {
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
    };

    config.optimization.moduleIds = 'named';

    // Ensure WASM files are output correctly
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
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

export default nextConfig;