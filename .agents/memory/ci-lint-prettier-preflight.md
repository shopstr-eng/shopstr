# CI Lint & Prettier Preflight

## Problem

GitHub Actions (`.github/workflows/lint-prettier.yml`) runs `npm run format:check` (`prettier --check .`), which checks the formatting of the **entire repository**, not just files staged or changed in a PR.

If upstream commits or merges introduce unformatted files to `main`, any new branch created off `main` will fail CI during the `Run Prettier` step unless the entire repository satisfies `prettier --check .`.

## Rule

1. **Never push code without running full-repo `format:check`**:
   Before declaring work complete, creating a PR, or pushing to remote, always execute:

   ```bash
   npm run lint-all
   ```

   which runs:
   - `npm run type-check` (`tsc --noEmit`)
   - `npm run lint` (`eslint . --ext .ts,.tsx`)
   - `npm run format:check` (`prettier --check .`)

2. **If `format:check` fails**:
   Run:
   ```bash
   npx prettier --write .
   ```
   and commit all formatting updates so that the PR branch leaves the entire repository passing `npm run format:check`.
