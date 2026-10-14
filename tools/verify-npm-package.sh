#!/usr/bin/env bash
# Pack .npm-package, install the tarball into a clean prefix, and assert zcp TUI starts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$(cd "${1:-$ROOT/.npm-package}" && pwd)"
TIMEOUT_SECS="${VERIFY_TUI_TIMEOUT_SECS:-30}"
# Real first-paint string from a packed global install (empty HOME, no models configured).
TUI_MARKER="Type a prompt"

if [[ ! -f "$PKG_DIR/package.json" || ! -f "$PKG_DIR/dist/zcode.cjs" ]]; then
  echo "missing prepared package in $PKG_DIR (run: node tools/prepare-npm-package.mjs .npm-package)" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/zcp-npm-verify.XXXXXX")"
cleanup() {
  if [[ -n "${SESSION:-}" ]]; then
    tmux kill-session -t "$SESSION" 2>/dev/null || true
  fi
  if [[ -n "${SCRIPT_PID:-}" ]]; then
    kill "$SCRIPT_PID" 2>/dev/null || true
    wait "$SCRIPT_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$TMP/home" "$TMP/prefix" "$TMP/project"
export HOME="$TMP/home"

echo "==> npm pack in $PKG_DIR"
TGZ="$(
  cd "$PKG_DIR"
  npm pack --silent
)"
TGZ_PATH="$PKG_DIR/$TGZ"
echo "    $TGZ"

echo "==> npm install -g --prefix $TMP/prefix"
npm install -g --prefix "$TMP/prefix" "$TGZ_PATH"
ZCP="$TMP/prefix/bin/zcp"
if [[ ! -x "$ZCP" ]]; then
  echo "zcp binary missing after global install: $ZCP" >&2
  exit 1
fi

echo "==> zcp --version"
VERSION_OUT="$("$ZCP" --version | tr -d '\r')"
EXPECTED_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
if [[ "$VERSION_OUT" != "$EXPECTED_VERSION" ]]; then
  echo "version mismatch: expected $EXPECTED_VERSION, got $VERSION_OUT" >&2
  exit 1
fi

capture_pane() {
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux capture-pane -t "$SESSION" -p -J
  elif [[ -f "$TMP/script.out" ]]; then
    # script(1) typescript; strip crude ANSI
    sed -E 's/\x1B\[[0-9;?]*[A-Za-z]//g' "$TMP/script.out"
  else
    echo "(no capture available)"
  fi
}

fail_with_capture() {
  local msg="$1"
  echo "$msg" >&2
  echo "----- capture -----" >&2
  capture_pane >&2 || true
  echo "----- end capture -----" >&2
  exit 1
}

SESSION="zcp-verify-$$"
echo "==> launch zcp in PTY (timeout ${TIMEOUT_SECS}s)"
if command -v tmux >/dev/null 2>&1; then
  tmux new-session -d -s "$SESSION" -x 120 -y 40 \
    "cd '$TMP/project' && '$ZCP'; echo EXIT:\$?; sleep 120"
else
  echo "tmux not found; falling back to script(1)" >&2
  if ! command -v script >/dev/null 2>&1; then
    echo "neither tmux nor script available" >&2
    exit 1
  fi
  # script keeps a PTY; run in background
  script -q -c "cd '$TMP/project' && '$ZCP'" "$TMP/script.out" >/dev/null 2>&1 &
  SCRIPT_PID=$!
fi

deadline=$((SECONDS + TIMEOUT_SECS))
CAPTURE=""
while (( SECONDS < deadline )); do
  sleep 1
  CAPTURE="$(capture_pane || true)"
  if grep -Fq 'Cannot find package' <<<"$CAPTURE"; then
    fail_with_capture "TUI launch reported Cannot find package"
  fi
  if grep -Eiq '(^|[[:space:]])Error:|Cannot find module|ERR_MODULE_NOT_FOUND' <<<"$CAPTURE"; then
    fail_with_capture "TUI launch reported an Error stack / module resolution failure"
  fi
  if grep -Fq "$TUI_MARKER" <<<"$CAPTURE"; then
    echo "==> TUI marker found: $TUI_MARKER"
    echo "verify-npm-package: ok"
    exit 0
  fi
done

fail_with_capture "TUI marker ${TUI_MARKER@Q} not seen within ${TIMEOUT_SECS}s"
