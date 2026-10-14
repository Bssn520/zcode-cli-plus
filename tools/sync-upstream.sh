#!/usr/bin/env bash
# Sync a CLI-only slice of upstream zai-org/ZCode into a target repo.
# Usage: sync-upstream.sh <upstream-checkout> <tag> <target-repo-dir>
# Idempotent: managed paths are deleted and re-copied; unmanaged files in target are left alone.
set -euo pipefail
SRC=$(realpath "$1"); TAG="$2"; DST="$3"
TOOLS=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
mkdir -p "$DST"; DST=$(realpath "$DST")
[ -d "$SRC/apps/zcode-cli" ] || { echo "not a ZCode checkout: $SRC" >&2; exit 1; }

PKGS=(shared provider provider-node model-option-map zcode-cua formal-proof)
DIRS=(apps/zcode-cli third-party config)
for p in "${PKGS[@]}"; do DIRS+=("packages/$p"); done
ROOT_FILES=(LICENSE NOTICE.md THIRD-PARTY-NOTICES.md .npmrc .nvmrc .gitattributes .gitignore
  tsconfig.base.json .env.production .env.development .env.example pnpm-lock.yaml)
PATCHES=("vitest@4.1.7.patch" "@ai-sdk__openai-compatible@2.0.60.patch" "@ai-sdk__anthropic@3.0.81.patch")

copy_dir() { rm -rf "$DST/$1"; mkdir -p "$(dirname "$DST/$1")"
  (cd "$SRC" && tar cf - --exclude=node_modules --exclude=dist --exclude=.turbo --exclude='*.tsbuildinfo' "$1") | tar xf - -C "$DST"; }

for d in "${DIRS[@]}"; do copy_dir "$d"; done
for f in "${ROOT_FILES[@]}"; do cp "$SRC/$f" "$DST/$f"; done
rm -rf "$DST/patches"; mkdir -p "$DST/patches"
for p in "${PATCHES[@]}"; do cp "$SRC/patches/$p" "$DST/patches/"; done

# Individual files outside the slice that CLI tests read/import (kept at original paths).
# - packages/services/.../schema-v1.ts: imported by bootstrap/tests/database-rollback-readability.test.ts (GUI pkg, no imports of its own)
EXTRA_FILES=(packages/services/src/session/tasksDatabase/schema-v1.ts)
# - docs/*.md referenced as repo-relative string paths from CLI sources/tests (auto-detected)
while read -r f; do EXTRA_FILES+=("$f"); done < <(cd "$SRC" && grep -rhoE "[\"'\`]docs/[A-Za-z0-9_./-]+\.md" \
  apps/zcode-cli/packages "${PKGS[@]/#/packages/}" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null \
  | tr -d "\"'\`" | sort -u | while read -r f; do [ -f "$f" ] && echo "$f"; done)
rm -rf "$DST/docs" "$DST/packages/services"
for f in "${EXTRA_FILES[@]}"; do mkdir -p "$DST/$(dirname "$f")"; cp "$SRC/$f" "$DST/$f"; done

# Root scripts/: transitive closure of root scripts referenced from kept dirs.
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts"
cd "$SRC"
grep -rhoE '(\.\./)+scripts/[A-Za-z0-9_./-]+\.mjs' "${DIRS[@]}" --exclude-dir=node_modules 2>/dev/null \
  | sed -E 's#.*scripts/#scripts/#' | sort -u > /tmp/zsync.$$
while :; do
  : > /tmp/zsync.new.$$
  while read -r f; do [ -f "$f" ] || continue
    grep -oE "[\"'](\./|\.\./)[A-Za-z0-9_./-]+\.m?js[\"']" "$f" | tr -d "\"'" | while read -r r; do
      realpath -m --relative-to=. "$(dirname "$f")/$r"; done >> /tmp/zsync.new.$$ || true
  done < /tmp/zsync.$$
  sort -u /tmp/zsync.$$ /tmp/zsync.new.$$ | grep '^scripts/' > /tmp/zsync.all.$$ || true
  cmp -s /tmp/zsync.$$ /tmp/zsync.all.$$ && break; mv /tmp/zsync.all.$$ /tmp/zsync.$$
done
while read -r f; do [ -f "$f" ] && cp "$f" "$DST/$f"; done < /tmp/zsync.$$
rm -f /tmp/zsync*.$$

# Our CI test gate (not upstream): known upstream failures for this tag + runner.
mkdir -p "$DST/ci"
cp "$TOOLS/collect-failures.sh" "$TOOLS/test-known-failures.sh" "$DST/ci/"
[ -f "$TOOLS/known-failures.tsv" ] && cp "$TOOLS/known-failures.tsv" "$DST/ci/known-failures.tsv"

# Trimmed root package.json / pnpm-workspace.yaml
node - "$SRC" "$DST" "${PATCHES[@]}" <<'JS'
const fs=require('fs'),path=require('path');const [src,dst,...patches]=process.argv.slice(2);
const pkg=JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8'));
const keepDev=['@types/node','@vitest/coverage-v8','typescript','vitest','tsx','turbo','oxfmt','oxlint','postject',
 'release-it','@release-it/conventional-changelog','conventional-changelog-conventionalcommits','conventional-changelog-writer','dotenv'];
const devDependencies={};for(const k of keepDev) if(pkg.devDependencies[k]) devDependencies[k]=pkg.devDependencies[k];
// Undeclared deps that upstream CLI code only gets via hoisting from GUI packages (pinned to upstream lock).
// - @modelcontextprotocol/sdk: imported by apps/zcode-cli/packages/node-repl-host/src/cua-bridge.ts, hoisted from shadcn (GUI).
{ const f=path.join(dst,'apps/zcode-cli/packages/node-repl-host/package.json'); const j=JSON.parse(fs.readFileSync(f,'utf8'));
  j.devDependencies={...j.devDependencies,'@modelcontextprotocol/sdk':'1.29.0'}; fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n'); }
const pd={};for(const [k,v] of Object.entries(pkg.pnpm.patchedDependencies)) if(patches.includes(path.basename(v))) pd[k]=v;
const out={name:'zcode-cli-plus-workspace',version:pkg.version,private:true,type:'module',
 scripts:{build:'pnpm --dir apps/zcode-cli build','cli:build':'pnpm --dir apps/zcode-cli cli:build',
  test:'pnpm --dir apps/zcode-cli test','test:ci':'bash ci/test-known-failures.sh',typecheck:'pnpm --dir apps/zcode-cli typecheck',lint:'pnpm --dir apps/zcode-cli lint',
  'build:sea':pkg.scripts['build:sea'],'build:sea:all':pkg.scripts['build:sea:all'],'release:cli':pkg.scripts['release:cli'],'release:cli:dry':pkg.scripts['release:cli:dry']},
 devDependencies,engines:pkg.engines,packageManager:pkg.packageManager,
 pnpm:{overrides:pkg.pnpm.overrides,patchedDependencies:pd},license:pkg.license};
fs.writeFileSync(path.join(dst,'package.json'),JSON.stringify(out,null,2)+'\n');
let ws=fs.readFileSync(path.join(src,'pnpm-workspace.yaml'),'utf8');
const pk=['shared','provider','provider-node','model-option-map','zcode-cua','formal-proof'];
ws=ws.replace(/^packages:\n(  - .*\n)+/m,'packages:\n'+pk.map(p=>`  - packages/${p}\n`).join('')+
 '  - apps/zcode-cli\n  - apps/zcode-cli/packages/*\n  - apps/zcode-cli/tools/*\n');
for (const b of ['edgedriver','electron','electron-winstaller','geckodriver']) ws=ws.replace(new RegExp(`^  ${b}: true\\n`,'m'),'');
fs.writeFileSync(path.join(dst,'pnpm-workspace.yaml'),ws);
JS
COMMIT=$(git -C "$SRC" rev-parse HEAD 2>/dev/null || echo unknown)
printf 'tag=%s\ncommit=%s\nsource=https://github.com/zai-org/ZCode\n' "$TAG" "$COMMIT" > "$DST/UPSTREAM_TAG"
# Prune upstream lockfile to the CLI-only workspace (keeps upstream-resolved versions). Skip with NO_LOCK=1.
if [ "${NO_LOCK:-0}" != 1 ]; then (cd "$DST" && pnpm install --lockfile-only --ignore-scripts >/dev/null); fi
echo "synced $TAG -> $DST"
