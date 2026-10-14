#!/usr/bin/env bash
# CI test gate: runs CLI package tests, tolerates entries in ci/known-failures.tsv
# (pre-existing upstream / documented slice failures), fails on any NEW failure.
# Affected mode: if ZCP_AFFECTED_PACKAGES is set, only those packages are run/compared.
# If unset and ZCP_AFFECTED=1, derive via `turbo ls --affected --output=json`;
# fall back to the full suite when affected packages cannot be determined.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [ -z "${ZCP_AFFECTED_PACKAGES:-}" ] && [ "${ZCP_AFFECTED:-0}" = 1 ]; then
  json=$(cd "$ROOT/apps/zcode-cli" && ../../node_modules/.bin/turbo ls --affected --output=json 2>/dev/null || true)
  pkgs=$(node -e '
    let j; try { j = JSON.parse(process.argv[1] || ""); } catch { process.exit(0); }
    const items = j?.packages?.items;
    if (!Array.isArray(items) || items.length === 0) process.exit(0);
    process.stdout.write(items.map((x) => x.name).filter(Boolean).join(" "));
  ' "$json" 2>/dev/null || true)
  if [ -n "$pkgs" ]; then
    export ZCP_AFFECTED_PACKAGES="$pkgs"
    echo "affected packages: $ZCP_AFFECTED_PACKAGES"
  else
    echo "affected packages undeterminable; running full suite"
    unset ZCP_AFFECTED_PACKAGES || true
  fi
fi

OUT=$(mktemp); bash "$ROOT/ci/collect-failures.sh" "$ROOT" "$OUT" >/dev/null
KNOWN=$(mktemp)
# Filter known list to affected packages when set (so fixed-outside-scope noise is ignored).
if [ -n "${ZCP_AFFECTED_PACKAGES:-}" ]; then
  node -e '
    const allow = new Set(process.argv[1].split(/\s+/).filter(Boolean));
    const fs = require("fs");
    for (const line of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const pkg = line.split("\t")[0];
      const short = pkg.startsWith("@zcode/") ? pkg.slice(7) : pkg;
      if (allow.has(pkg) || allow.has(short) || allow.has("@zcode/" + short)) console.log(line);
    }
  ' "$ZCP_AFFECTED_PACKAGES" "$ROOT/ci/known-failures.tsv" | cut -f1-3 | sort -u > "$KNOWN"
else
  grep -v '^#' "$ROOT/ci/known-failures.tsv" | cut -f1-3 | sort -u > "$KNOWN"
fi
NEW=$(comm -23 <(sort -u "$OUT") "$KNOWN")
# test='*' in known list matches any failing case for that package+file.
if [ -n "$NEW" ]; then
  NEW=$(awk -F'\t' 'NR==FNR{if($3=="*")w[$1 SUBSEP $2]=1;next} !(($1 SUBSEP $2) in w)' "$KNOWN" <(printf '%s\n' "$NEW"))
fi
# '*' rows are file-level flaky markers; never treat them as FIXED/'fail'.
FIXED=$(comm -13 <(sort -u "$OUT") <(grep -v '^#' "$ROOT/ci/known-failures.tsv" | awk -F'\t' '$5=="fail" && $3!="*"' | cut -f1-3 | sort -u))
# In affected mode, only warn about fixed entries inside the affected set.
if [ -n "${ZCP_AFFECTED_PACKAGES:-}" ] && [ -n "$FIXED" ]; then
  FIXED=$(echo "$FIXED" | while IFS=$'\t' read -r pkg rest; do
    short=${pkg#@zcode/}
    case " $ZCP_AFFECTED_PACKAGES " in
      *" $pkg "*|*" $short "*|*" @zcode/$short "*) printf '%s\t%s\n' "$pkg" "$rest" ;;
    esac
  done)
fi
echo "failures: $(wc -l < "$OUT") (known: $(wc -l < "$KNOWN"))"
[ -n "$FIXED" ] && { echo "::warning::known failures now passing (remove from list):"; echo "$FIXED"; }
if [ -n "$NEW" ]; then echo "::error::NEW test failures:"; echo "$NEW"; exit 1; fi
echo "OK: no new failures"
