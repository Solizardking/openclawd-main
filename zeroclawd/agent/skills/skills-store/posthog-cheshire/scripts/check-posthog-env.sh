#!/usr/bin/env bash
# PostHog env readiness (never prints secret values).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
failed=0

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}"
      local v="${BASH_REMATCH[2]}"
      v="${v%\"}" ; v="${v#\"}"
      v="${v%\'}" ; v="${v#\'}"
      if [[ -z "${!k:-}" ]]; then
        export "$k=$v"
      fi
    fi
  done < "$f"
}

load_env_file "${ROOT}/.env"
load_env_file "${ROOT}/.env.local"
load_env_file "${ROOT}/worker/.dev.vars"

present() {
  local name="$1"
  local val="${!name:-}"
  if [[ -n "$val" ]]; then
    echo "PASS  ${name} (len=${#val})"
  else
    echo "WARN  ${name} missing"
    return 1
  fi
}

echo "posthog-cheshire env check"
present POSTHOG_API_KEY || true
present POSTHOG_HOST || true
present VITE_POSTHOG_KEY || true
present VITE_POSTHOG_HOST || true

host="${POSTHOG_HOST:-${VITE_POSTHOG_HOST:-https://us.i.posthog.com}}"
if [[ "$host" == https://us.i.posthog.com* || "$host" == https://us.posthog.com* ]]; then
  echo "PASS  host looks like US cloud (${host})"
else
  echo "WARN  unexpected host ${host}"
fi

if [[ "${VITE_POSTHOG_DISABLED:-}" == "true" ]]; then
  echo "WARN  VITE_POSTHOG_DISABLED=true (browser capture hard-off)"
fi

# Client always has a default project key — server needs POSTHOG_API_KEY for node
if [[ -z "${POSTHOG_API_KEY:-}" ]]; then
  echo "WARN  server capture may no-op without POSTHOG_API_KEY"
  failed=0  # warning only
fi

# Client source present
if [[ -f "${ROOT}/client/src/lib/posthog.ts" ]]; then
  echo "PASS  client/src/lib/posthog.ts present"
else
  echo "FAIL  client/src/lib/posthog.ts missing"
  failed=$((failed + 1))
fi

if [[ -f "${ROOT}/server/lib/posthog.ts" ]]; then
  echo "PASS  server/lib/posthog.ts present"
else
  echo "FAIL  server/lib/posthog.ts missing"
  failed=$((failed + 1))
fi

echo ""
echo "Failed: ${failed}"
exit "${failed}"
