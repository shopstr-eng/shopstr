/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
      config.output.environment = {
        ...config.output.environment,
        asyncFunction: true,
      };
    }

    config.experiments = {
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
    };

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