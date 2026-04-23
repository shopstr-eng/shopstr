#!/usr/bin/env bash
# Deployment build script for Replit Autoscale.
#
# Produces a Next.js standalone bundle. Autoscale provides its own Node.js
# runtime via the `nodejs-22` Nix module declared in .replit, so we do NOT
# bundle a custom Node binary. We also preserve all top-level config files
# (.replit, replit.nix, package.json, pnpm-lock.yaml) that Autoscale needs
# to boot the app.

set -e

echo "==> Pre-build cleanup (remove dev artifacts that bloat the image)"
rm -rf \
  .next \
  .cache \
  cache \
  .swc \
  .turbo \
  .pnpm-store \
  node_modules \
  packages/*/node_modules \
  apps/*/node_modules \
  apps/mobile \
  coverage \
  "$HOME/.cache" \
  "$HOME/.pnpm-store" \
  "$HOME/.local/share/pnpm" \
  /tmp/* 2>/dev/null || true

echo "==> Installing production deps (web only)"
pnpm install \
  --frozen-lockfile \
  --prefer-offline \
  --filter=milk-market... \
  --filter='!@milk-market/mobile'

echo "==> Building Next.js (standalone output)"
next build

echo "==> Folding static + public into the standalone bundle"
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> Post-build cleanup (drop only large, runtime-irrelevant items)"
# IMPORTANT: do NOT remove .replit, replit.nix, package.json, pnpm-lock.yaml,
# .nvmrc, or .node-version. Autoscale needs them to boot the app.
# The standalone bundle ships its own node_modules under
# .next/standalone/node_modules, so the top-level node_modules can go.
rm -rf \
  node_modules \
  packages/*/node_modules \
  apps/*/node_modules \
  apps \
  packages \
  components \
  pages \
  utils \
  styles \
  db \
  mcp \
  proxy.ts \
  instrumentation.ts \
  __tests__ \
  coverage \
  .git \
  .github \
  .husky \
  .agents \
  .local \
  .upm \
  .swc \
  .cache \
  cache \
  .turbo \
  .pnpm-store \
  attached_assets \
  docs \
  tsconfig.tsbuildinfo \
  jest.config.cjs \
  jest.setup.js \
  eslint.config.mjs \
  .eslintrc.json \
  .eslintrc.security.js \
  .prettierrc \
  .prettierignore \
  Dockerfile \
  docker-compose.yml \
  .dockerignore \
  README.md \
  CONTRIBUTING.md \
  LICENSE \
  replit.md \
  threat_model.md \
  public \
  2>/dev/null || true

# Inside .next, only the standalone bundle is needed at runtime.
node -e "
  const fs = require('fs');
  const path = require('path');
  if (fs.existsSync('.next')) {
    for (const f of fs.readdirSync('.next')) {
      if (f !== 'standalone') fs.rmSync(path.join('.next', f), { recursive: true, force: true });
    }
  }
"

echo "==> Bundling portable Node 22 binary for runtime"
# Autoscale's runtime container ships an older `node` on PATH (observed
# v18.12.1). Next.js 16 needs Node 22+ for AsyncLocalStorage.snapshot(), so
# we ship a portable Node 22 binary alongside the bundle. We download the
# official portable build (linux-x64) instead of copying from the Nix store
# because Nix binaries depend on a custom dynamic linker
# (/nix/store/...-glibc/lib/ld-linux-x86-64.so.2) that does not exist in the
# autoscale runtime container.
NODE_VERSION="v22.22.0"
NODE_DIST="node-${NODE_VERSION}-linux-x64"
mkdir -p .runtime
if [ ! -x ".runtime/bin/node" ]; then
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.xz" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /tmp
  mkdir -p .runtime/bin
  cp "/tmp/${NODE_DIST}/bin/node" .runtime/bin/node
  chmod +x .runtime/bin/node
  rm -rf "/tmp/${NODE_DIST}" /tmp/node.tar.xz
fi
echo "    bundled $(./.runtime/bin/node --version) (portable, glibc-compatible)"

echo "==> Final size:"
du -sh . .next .next/standalone .runtime 2>/dev/null || true
echo "==> Top-level files preserved:"
ls -la | head -30
