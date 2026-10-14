#!/usr/bin/env bash
# CI test gate: runs all CLI package tests, tolerates entries in ci/known-failures.tsv
# (pre-existing upstream failures), fails on any NEW failure.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$(mktemp); bash "$ROOT/ci/collect-failures.sh" "$ROOT" "$OUT" >/dev/null
KNOWN=$(mktemp); grep -v '^#' "$ROOT/ci/known-failures.tsv" | cut -f1-3 | sort -u > "$KNOWN"
NEW=$(comm -23 <(sort -u "$OUT") "$KNOWN")
FIXED=$(comm -13 <(sort -u "$OUT") <(grep -v '^#' "$ROOT/ci/known-failures.tsv" | awk -F'\t' '$5=="fail"' | cut -f1-3 | sort -u))
echo "failures: $(wc -l < "$OUT") (known: $(wc -l < "$KNOWN"))"
[ -n "$FIXED" ] && { echo "::warning::known failures now passing (remove from list):"; echo "$FIXED"; }
if [ -n "$NEW" ]; then echo "::error::NEW test failures:"; echo "$NEW"; exit 1; fi
echo "OK: no new failures"
