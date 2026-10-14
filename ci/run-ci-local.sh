#!/usr/bin/env bash
# Reproduce .github/workflows/ci.yml locally, exactly: same commands, no turbo cache reuse.
# (lint = root oxlint like upstream; turbo does not hash the repo-root .oxlintrc.json because apps/zcode-cli is turbo's root,
#  so a cached local lint can hide config changes; --force always re-executes.)
set -euo pipefail
export CI=true  # same env as GitHub Actions
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm lint
(cd apps/zcode-cli && ../../node_modules/.bin/turbo run typecheck --force)
pnpm --filter zcode-cli build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --version
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help >/dev/null
pnpm test:ci
