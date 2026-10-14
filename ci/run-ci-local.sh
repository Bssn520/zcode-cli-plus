#!/usr/bin/env bash
# Reproduce .github/workflows/ci.yml locally: same commands, no turbo cache reuse.
set -euo pipefail
export CI=true
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm lint
(cd apps/zcode-cli && ../../node_modules/.bin/turbo run typecheck --force)
pnpm --filter zcode-cli build
node tools/prepare-npm-package.mjs .npm-package
bash tools/verify-npm-package.sh .npm-package
node apps/zcode-cli/packages/cli/dist/zcode.cjs --version
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help >/dev/null
pnpm test:ci
