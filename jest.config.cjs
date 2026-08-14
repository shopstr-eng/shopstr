const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  collectCoverageFrom: [
    "utils/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "pages/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!pages/_app.tsx",
    "!pages/_document.tsx",
    "!public/**",
    "mcp/**/*.{ts,tsx}",
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
    // Canonical parser sources use NodeNext-style .js relative imports so
    // the same files can be copied verbatim into packages/shopstr-mcp.
    "^(\\.{1,2}/.*)\\.js$": "$1",
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
