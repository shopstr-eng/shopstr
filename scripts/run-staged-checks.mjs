import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
const localBin = (command) =>
  join(
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${command}.cmd` : command
  );

const run = (command, args) => {
  if (args.length === 0) {
    return;
  }

  const result = spawnSync(command, args, { stdio: "inherit" });
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
  run("git", ["add", "--", ...filesToRestage]);
}
