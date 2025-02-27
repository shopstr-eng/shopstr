const env = {
  isShopstrDevEnvironment:
    process.env.NODE_ENV === "development" &&
    process?.env?.NEXT_PUBLIC_DEV_ENVIRONMENT === "true",
  isDevelopment: process.env.NODE_ENV === "development",
  isServer: typeof window === "undefined",
};

export default env;
