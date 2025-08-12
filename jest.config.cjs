const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
  },
};

module.exports = async () => {
  const jestConfig = await createJestConfig(customJestConfig)();
  jestConfig.transformIgnorePatterns = [
    '/node_modules/(?!(dexie|nostr-tools|@getalby/lightning-tools|@cashu/cashu-ts)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ];

  return jestConfig;
};
