const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 55,
      statements: 55,
    },
  },
  moduleNameMapper: {
    // Handle module aliases
    "^@/(.*)$": "<rootDir>/$1",
    "^@heroui/react$": "<rootDir>/test/mocks/heroui-react.tsx",
    "^react-responsive-carousel$":
      "<rootDir>/test/mocks/react-responsive-carousel.tsx",
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
