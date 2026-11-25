import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const distDir = path.join(packageDir, "dist");

await rm(distDir, { recursive: true, force: true });
