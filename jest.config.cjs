const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  collectCoverageFrom: [
    "utils/nostr/nostr-helper-functions.ts",
    "utils/nostr/fetch-service.ts",
    "utils/db/cache-event-policy.ts",
    "utils/parsers/product-parser-functions.ts",
    "utils/parsers/product-tag-helpers.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 20,
      statements: 20,
    },
  },
  moduleNameMapper: {
    // Handle module aliases
    "^@/(.*)$": "<rootDir>/$1",
  },
};

module.exports = async () => {
  const jestConfig = await createJestConfig(customJestConfig)();
  jestConfig.transformIgnorePatterns = [
    "/node_modules/(?!(dexie|nostr-tools|@noble|@scure|@getalby/lightning-tools|@cashu/cashu-ts|uuid)/)",
    "^.+\\.module\\.(css|sass|scss)$",
  ];

  return jestConfig;
};
