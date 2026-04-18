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

echo "==> Final size:"
du -sh . .next .next/standalone 2>/dev/null || true
echo "==> Top-level files preserved:"
ls -la | head -30
