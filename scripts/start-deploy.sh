#!/usr/bin/env bash
# Production start script for Replit Autoscale.
#
# Next.js 16 requires Node.js 22+. The autoscale runtime container's default
# `node` on PATH can be an older version (we've observed v18.12.1), which
# breaks Next's internal AsyncLocalStorage.snapshot() calls and crashes every
# request. We explicitly locate a Node 22 binary that the `nodejs-22` Nix
# module provides (or that we bundled at build time) and use it directly.

set -e

export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"

find_node22() {
  # 1) Bundled binary copied during build (most reliable).
  if [ -x ".runtime/bin/node" ]; then
    echo "$(pwd)/.runtime/bin/node"
    return 0
  fi

  # 2) If `node` on PATH is already >= 22, just use it.
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$v" -ge 22 ] 2>/dev/null; then
      command -v node
      return 0
    fi
  fi

  # 3) Try the Nix store (path baked into the deploy image, if present).
  local candidate
  candidate="$(ls -1d /nix/store/*-nodejs-22*/bin/node 2>/dev/null | head -1)"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  # 4) Try the user's nix profile.
  for p in "$HOME/.nix-profile/bin/node" /nix/var/nix/profiles/default/bin/node; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done

  return 1
}

NODE_BIN="$(find_node22 || true)"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: could not find Node.js 22 binary in deploy image" >&2
  echo "PATH=$PATH" >&2
  command -v node >/dev/null 2>&1 && node --version >&2
  exit 1
fi

echo "==> Using Node: $NODE_BIN ($("$NODE_BIN" --version))"
exec "$NODE_BIN" .next/standalone/server.js
