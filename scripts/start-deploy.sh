#!/usr/bin/env bash
# Production start script for Replit Autoscale.
# Autoscale provides Node.js 22 via the `nodejs-22` Nix module declared in
# .replit, so we just invoke `node` from PATH on the standalone server.

set -e

export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"

echo "==> Starting Next.js standalone server with $(node --version)"
exec node .next/standalone/server.js
