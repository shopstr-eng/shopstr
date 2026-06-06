const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to our Next.js app to load next.config.js and .env files in our test environment
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  collectCoverageFrom: [
    "utils/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "pages/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!pages/_app.tsx",
    "!pages/_document.tsx",
    "!public/**",
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
  // ESM-only deps (nostr-tools, @noble/*, @scure/*, @cashu/cashu-ts, etc.) must
  // be transformed by Jest or Node crashes with "Cannot use import statement
  // outside a module".
  //
  // A single optional-group negative lookahead does NOT work here: because the
  // pattern isn't anchored, the regex engine backtracks and matches at the outer
  // `node_modules/.pnpm` (with the optional `.pnpm/.../node_modules/` group empty),
  // wrongly IGNORING ESM-only deps like @noble/curves/secp256k1.js so they reach
  // Node untransformed and crash. Use TWO explicit patterns instead — one for the
  // pnpm store layout and one for the classic/hoisted layout — each asserting the
  // package dir right before its files.
  const esmAllowlist = "dexie|nostr-tools|@noble|@scure|@getalby|@cashu|uuid";
  jestConfig.transformIgnorePatterns = [
    `node_modules/\\.pnpm/[^/]+/node_modules/(?!(${esmAllowlist})/)`,
    `node_modules/(?!\\.pnpm/)(?!(${esmAllowlist})/)`,
    "^.+\\.module\\.(css|sass|scss)$",
  ];

  return jestConfig;
};
