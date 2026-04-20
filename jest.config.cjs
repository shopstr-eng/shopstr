const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    // Handle module aliases
    "^@/(.*)$": "<rootDir>/$1",
  },
};

module.exports = async () => {
  const jestConfig = await createJestConfig(customJestConfig)();
  // Note: pnpm hoists modules under node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>.
  // The negative lookahead has to handle BOTH the classic `node_modules/@noble/...`
  // layout and the pnpm `node_modules/.pnpm/.../node_modules/@noble/...` layout,
  // otherwise ESM-only deps like @noble/hashes/sha2.js are passed through to
  // Node untransformed and crash with "Cannot use import statement outside a module".
  jestConfig.transformIgnorePatterns = [
    "/node_modules/(?:\\.pnpm/[^/]+/node_modules/)?(?!(dexie|nostr-tools|@noble|@scure|@getalby/lightning-tools|@cashu/cashu-ts|uuid)/)",
    "^.+\\.module\\.(css|sass|scss)$",
  ];

  return jestConfig;
};
