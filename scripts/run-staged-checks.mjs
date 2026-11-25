import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const stagedResult = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" }
);

if (stagedResult.status !== 0) {
  console.error("Unable to read staged files.");
  process.exit(stagedResult.status ?? 1);
}

const stagedFiles = stagedResult.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => existsSync(file));

const byExtension = (extensions) =>
  stagedFiles.filter((file) =>
    extensions.some((extension) => file.endsWith(extension))
  );

const eslintFiles = byExtension([".ts", ".tsx"]);
const prettierFiles = byExtension([
  ".css",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const jestFiles = byExtension([".js", ".jsx", ".ts", ".tsx"]);
const filesToRestage = Array.from(new Set([...eslintFiles, ...prettierFiles]));
// Run a package's JS bin entry with the current Node binary instead of the
// node_modules/.bin shim. On Windows the shim is a .cmd file, which Node
// refuses to spawn without `shell: true` (EINVAL since CVE-2024-27980), and
// a shell would make staged filenames subject to command interpretation.
const localBin = (packageName) => {
  const packageJsonPath = join("node_modules", packageName, "package.json");
  const { bin } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const entry = typeof bin === "string" ? bin : bin[packageName];
  return [process.execPath, join(dirname(packageJsonPath), entry)];
};

const run = ([command, ...prefixArgs], args) => {
  if (args.length === 0) {
    return;
  }

  const result = spawnSync(command, [...prefixArgs, ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Unable to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (eslintFiles.length > 0) {
  run(localBin("eslint"), ["--fix", "--", ...eslintFiles]);
}

if (prettierFiles.length > 0) {
  run(localBin("prettier"), ["--write", "--", ...prettierFiles]);
}

if (jestFiles.length > 0) {
  run(localBin("jest"), [
    "--bail",
    "--findRelatedTests",
    "--passWithNoTests",
    "--",
    ...jestFiles,
  ]);
}

if (filesToRestage.length > 0) {
  run(["git"], ["add", "--", ...filesToRestage]);
}
