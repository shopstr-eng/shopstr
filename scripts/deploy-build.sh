#!/usr/bin/env bash
# Deployment build script for Replit Autoscale.
# Goal: produce the smallest possible runtime image while keeping
# all environment/config files the Nix runtime needs (so `node` stays on PATH).

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
# Keep all top-level config files (.replit, replit.nix, package.json,
# .nvmrc, .node-version, etc.) so the runtime container can boot.
# Only delete known-large directories and source we no longer need.
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
  pnpm-lock.yaml \
  package-lock.json \
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
# We download the official portable Node 22 build (linux-x64) instead of
# copying the Nix-store binary, because Nix binaries use a custom dynamic
# linker path (/nix/store/...-glibc/lib/ld-linux-x86-64.so.2) that doesn't
# exist in the autoscale runtime container. The official tarball is a
# standard Linux binary that works on any glibc-based system.
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
