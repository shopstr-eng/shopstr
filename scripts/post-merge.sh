#!/bin/bash
# Runs automatically after every task merge. Idempotent, non-interactive, fast.
# Merges can bring dependency changes to either lockfile, so reconcile both.
set -e

npm install --no-audit --no-fund
npm install --prefix packages/shopstr-mcp --no-audit --no-fund
