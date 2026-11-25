import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = join(testDirectory, "..");
const repositoryDirectory = join(packageDirectory, "..", "..");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const rootPackage = readJson(join(repositoryDirectory, "package.json"));
const mcpPackage = readJson(join(packageDirectory, "package.json"));
const mcpLockfile = readJson(join(packageDirectory, "package-lock.json"));

test("pins the MCP nostr-tools version exactly across manifests and lockfile", () => {
  const rootVersion = rootPackage.dependencies["nostr-tools"];
  const mcpVersion = mcpPackage.dependencies["nostr-tools"];

  assert.match(mcpVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(mcpVersion, rootVersion);
  assert.equal(
    mcpLockfile.packages[""].dependencies["nostr-tools"],
    mcpVersion
  );
  assert.equal(
    mcpLockfile.packages["node_modules/nostr-tools"].version,
    mcpVersion
  );
});

test("keeps the MCP Node engine aligned with the repository runtime", () => {
  assert.equal(mcpPackage.engines.node, rootPackage.engines.node);
});

test("keeps MCP package metadata aligned with the lockfile", () => {
  const expectedPackageName =
    process.env.SHOPSTR_MCP_EXPECTED_PACKAGE_NAME ?? "@shopstr/mcp";

  assert.equal(mcpPackage.name, expectedPackageName);
  assert.equal(mcpLockfile.name, mcpPackage.name);
  assert.equal(mcpLockfile.packages[""].name, mcpPackage.name);
  assert.equal(mcpLockfile.version, mcpPackage.version);
  assert.equal(mcpLockfile.packages[""].version, mcpPackage.version);
});
