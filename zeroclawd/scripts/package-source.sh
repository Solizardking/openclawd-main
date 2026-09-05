#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Clawd Bot — Slim source package                                            ║
# ║  Builds a git-archive tarball that respects .gitattributes export-ignore.    ║
# ║  Usage: scripts/package-source.sh [output.tar.gz]                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "error: git is required" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git work tree: $ROOT" >&2
  exit 1
fi

VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
PREFIX="clawdbot-go-${VERSION}/"
OUT_DIR="${CLAWD_PACKAGE_DIR:-$ROOT/build}"
OUT="${1:-$OUT_DIR/clawdbot-go-${VERSION}-source.tar.gz}"

# git -C <toplevel> resolves relative -o paths against the monorepo root,
# not go-bot/. Always absolutize so one-button package writes under go-bot/build.
case "$OUT" in
  /*) ;;
  *) OUT="$ROOT/$OUT" ;;
esac
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

# Support packaging when go-bot lives as a subdirectory of a monorepo
# (e.g. ClawdBrowser/go-bot) as well as when it is a standalone repo root.
# show-prefix returns "go-bot/" with a trailing slash; strip it for tree-ish.
# Resolve tree-ish from the monorepo root so "HEAD:go-bot" is not re-rooted
# as "go-bot/go-bot" when the script runs inside the subdirectory.
TOPLEVEL="$(git rev-parse --show-toplevel)"
REPO_PREFIX="$(git rev-parse --show-prefix 2>/dev/null || true)"
REPO_PREFIX="${REPO_PREFIX%/}"
if [[ -n "$REPO_PREFIX" ]]; then
  # Archive only this subtree; paths inside the tarball are relative to go-bot/.
  TREEISH="HEAD:${REPO_PREFIX}"
else
  TREEISH="HEAD"
fi

# Use committed tree attributes (go-bot/.gitattributes export-ignore).
# Do NOT pass --worktree-attributes here: when go-bot is nested in a monorepo,
# worktree attribute matching is rooted at the monorepo and drops subdirectory
# export-ignore rules, re-including PiedPiper bulk.
echo "📦 Packaging slim source archive..."
echo "   tree-ish: $TREEISH"
echo "   prefix:   $PREFIX"
echo "   output:   $OUT"

git -C "$TOPLEVEL" archive \
  --format=tar.gz \
  --prefix="$PREFIX" \
  -o "$OUT" \
  "$TREEISH"

BYTES="$(wc -c <"$OUT" | tr -d ' ')"
HUMAN="$(du -h "$OUT" | awk '{print $1}')"

echo "✓ wrote $OUT ($HUMAN, ${BYTES} bytes)"

# Soft size budget for the slim package (gzipped). Full trees with PiedPiper
# PDFs are multi-MB; slim target aims well under 3MB.
SOFT_MAX_BYTES="${CLAWD_PACKAGE_MAX_BYTES:-3145728}"
if [[ "$BYTES" -gt "$SOFT_MAX_BYTES" ]]; then
  echo "warning: package exceeds soft budget (${BYTES} > ${SOFT_MAX_BYTES}). Check export-ignore rules." >&2
fi

# List a few paths for operator confidence (and CI log grepping).
echo "── sample paths ──"
tar -tzf "$OUT" | head -20
echo "..."
COUNT="$(tar -tzf "$OUT" | wc -l | tr -d ' ')"
echo "── ${COUNT} archive entries ──"

# Fail hard if historical bulk or lockfiles leaked into the slim package.
if tar -tzf "$OUT" | grep -E 'PiedPiper-master|package-lock\.json|pnpm-lock\.yaml|node_modules/|/\.cache/' >/dev/null 2>&1; then
  echo "error: slim package contains excluded bulk paths" >&2
  tar -tzf "$OUT" | grep -E 'PiedPiper-master|package-lock\.json|pnpm-lock\.yaml|node_modules/|/\.cache/' | head -40 >&2
  exit 1
fi

# Required payload for a default Go install.
REQUIRED=(
  "go.mod"
  "go.sum"
  "Makefile"
  "install.sh"
  "README.md"
  "LICENSE"
  ".env.example"
  "cmd/clawdbot/main.go"
  "pkg/config/config.go"
)
LISTING="$(tar -tzf "$OUT")"
MISSING=0
for rel in "${REQUIRED[@]}"; do
  if ! printf '%s\n' "$LISTING" | grep -E "/${rel}$|/${rel}/" >/dev/null 2>&1 \
    && ! printf '%s\n' "$LISTING" | grep -F "/${rel}" >/dev/null 2>&1; then
    echo "error: required path missing from package: $rel" >&2
    MISSING=1
  fi
done
if [[ "$MISSING" -ne 0 ]]; then
  exit 1
fi

echo "✓ slim package validation passed"
printf '%s\n' "$OUT"
