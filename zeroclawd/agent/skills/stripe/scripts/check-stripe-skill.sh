#!/usr/bin/env bash
# Structural smoke: stripe store package documents plugin install + modern APIs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
fail=0

need() {
  if ! grep -qE "$1" "$SKILL" "$ROOT/references/"*.md 2>/dev/null; then
    echo "FAIL  missing pattern: $1"
    fail=1
  else
    echo "PASS  $1"
  fi
}

test -f "$SKILL" || { echo "FAIL  SKILL.md missing"; exit 1; }
need 'stripe@claude-plugins-official'
need '/plugin install stripe@claude-plugins-official'
need 'mcp\.stripe\.com'
need 'Checkout Session|checkout\.sessions'
need 'PaymentIntent'
need '/test-cards|/explain-error'

# No live secrets
if grep -RE 'sk_live_[0-9a-zA-Z]+|rk_live_[0-9a-zA-Z]{16,}' "$ROOT" 2>/dev/null; then
  echo "FAIL  live-looking Stripe secret in package"
  fail=1
else
  echo "PASS  no live secret blobs"
fi

exit "$fail"
