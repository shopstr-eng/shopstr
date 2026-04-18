#!/usr/bin/env bash
# Deployment build script for Replit Autoscale.
# Goal: produce the smallest possible runtime image containing only
# `.next/standalone/` (the standalone Next.js server bundle).

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

echo "==> Post-build cleanup (keep only what the runtime needs)"
node -e "
  const fs = require('fs');
  const path = require('path');
  const keep = new Set(['.next', '.replit', 'package.json']);
  for (const f of fs.readdirSync('.')) {
    if (!keep.has(f)) fs.rmSync(f, { recursive: true, force: true });
  }
  for (const f of fs.readdirSync('.next')) {
    if (f !== 'standalone') fs.rmSync(path.join('.next', f), { recursive: true, force: true });
  }
"

echo "==> Final size:"
du -sh . .next .next/standalone 2>/dev/null || true
