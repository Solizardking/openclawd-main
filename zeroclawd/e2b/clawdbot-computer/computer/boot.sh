#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/home/user}"
export CLAWDBOT_SKILLS_DIR="${CLAWDBOT_SKILLS_DIR:-$HOME/.clawdbot/skills}"
export CLAWDBOT_NPM_SPEC="${CLAWDBOT_NPM_SPEC:-clawdbot-go@latest}"
export PATH="$HOME/.npm-global/bin:/usr/local/bin:$PATH"

mkdir -p "$HOME/.clawdbot-computer" "$CLAWDBOT_SKILLS_DIR"

if [[ ! -f "$HOME/.clawdbot/skills/.clawdbot-prepackaged.json" ]]; then
  npx --yes "$CLAWDBOT_NPM_SPEC" skills-install --force || true
fi

exec node "$HOME/clawdbot-computer/serve.mjs"
