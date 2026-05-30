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
  // outside a module". pnpm stores packages two ways that both have to be
  // handled:
  //   - .pnpm store:  node_modules/.pnpm/@noble+curves@2.0.1/node_modules/@noble/curves/...
  //   - classic/hoisted: node_modules/@noble/curves/...
  // A single combined pattern with an OPTIONAL `.pnpm/...` group does NOT work:
  // the regex backtracks, matches the optional group as empty, and then the
  // lookahead inspects the literal string ".pnpm/" (never whitelisted), so the
  // whole path matches and the file is wrongly ignored. Splitting into two
  // anchored patterns avoids the backtracking trap.
  //
  // In the .pnpm store, scoped package dirs use `+` instead of `/`
  // (e.g. `@noble+curves@2.0.1`), so the .pnpm whitelist matches on `@noble+`.
  jestConfig.transformIgnorePatterns = [
    // .pnpm store layout: ignore everything except the whitelisted package dirs.
    "/node_modules/\\.pnpm/(?!(dexie@|nostr-tools@|@noble\\+|@scure\\+|@getalby\\+lightning-tools|@cashu\\+cashu-ts|uuid@))",
    // Classic/hoisted layout (anything not under .pnpm): same whitelist with `/`.
    "/node_modules/(?!\\.pnpm/)(?!(dexie|nostr-tools|@noble|@scure|@getalby/lightning-tools|@cashu/cashu-ts|uuid)/)",
    "^.+\\.module\\.(css|sass|scss)$",
  ];

  return jestConfig;
};
