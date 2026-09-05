#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/home/user}"
export CLAWDBOT_SKILLS_DIR="${CLAWDBOT_SKILLS_DIR:-$HOME/.clawdbot/skills}"
export CLAWDBOT_NPM_SPEC="${CLAWDBOT_NPM_SPEC:-clawdbot-go@latest}"

npx --yes "$CLAWDBOT_NPM_SPEC" skills-install --force
npx --yes "$CLAWDBOT_NPM_SPEC" oneshot --skip-go --skip-automaton --skip-birth --force
npx --yes "$CLAWDBOT_NPM_SPEC" skills-dir
npx --yes "$CLAWDBOT_NPM_SPEC" help
