#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Clawd Bot — One-Shot Installer (CLI binary: clawdbot)                     ║
# ║  curl -fsSL https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install.sh | bash
# ║  Branded edge aliases can serve this script from onchainai.fund / x402.wtf. ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

REPO="https://github.com/Solizardking/Zero-Bruh"
HUB_REPO="https://github.com/solizardking/solana-clawd"
TERMINAL_URL="https://cheshireterminal.ai"
# Hosted install + connect hub (aliases: /clawdbot-go · /clawdbot · /zero-clawd)
ZERO_CLAWD_URL="${CLAWDBOT_ZERO_CLAWD_URL:-https://cheshireterminal.ai/zeroclawd}"
AGENT_HUB_URL="${CLAWDBOT_AGENT_HUB_URL:-https://cheshireterminal.ai/agents}"
AGENT_FORGE_URL="${CLAWDBOT_AGENT_FORGE_URL:-https://cheshireterminal.ai/agents/forge}"
WEB_PORT="${CLAWDBOT_WEB_PORT:-18800}"
INSTALL_API="${CLAWDBOT_INSTALL_API:-https://zk.x402.wtf/api/install}"
ZKROUTER_BASE="https://clawdrouter-zk.fly.dev/v1"
RPC_URL="https://zk.x402.wtf/api/solana/rpc-public"
INSTALL_DIR="${CLAWDBOT_INSTALL_DIR:-$HOME/.clawdbot}"
BIN_DIR="${CLAWDBOT_BIN_DIR:-$HOME/.local/bin}"
SOURCE_MODE="${CLAWDBOT_SOURCE_MODE:-archive}"
REF="${CLAWDBOT_REF:-main}"
# When this script lives next to go.mod + cmd/clawdbot, prefer that tree
# (./install.sh from a clone) instead of re-downloading into ~/.clawdbot/src.
# Override with CLAWDBOT_FORCE_REMOTE_SOURCE=1 to always fetch.
_INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
LOCAL_SOURCE_DIR=""
if [[ -n "${_INSTALLER_DIR}" && -f "${_INSTALLER_DIR}/go.mod" && -d "${_INSTALLER_DIR}/cmd/clawdbot" ]]; then
  LOCAL_SOURCE_DIR="${_INSTALLER_DIR}"
fi
CORE_AI_REPO="${CLAWDBOT_CORE_AI_REPO:-https://github.com/Solizardking/core-ai}"
CORE_AI_REF="${CLAWDBOT_CORE_AI_REF:-clawd-stack-integration}"
CORE_AI_DIR="${CLAWDBOT_CORE_AI_DIR:-$INSTALL_DIR/core-ai}"
CORE_AI_MCP_CONFIG="${CLAWDBOT_CORE_AI_MCP_CONFIG:-$INSTALL_DIR/core-ai.mcp.json}"
INSTALL_COMPLETE="${CLAWDBOT_INSTALL_COMPLETE:-0}"
INSTALL_CORE_AI="${CLAWDBOT_INSTALL_CORE_AI:-0}"
INSTALL_VULCAN_EXPLICIT="${CLAWDBOT_INSTALL_VULCAN+x}"
INSTALL_VULCAN="${CLAWDBOT_INSTALL_VULCAN:-1}"
CLAWD_MINT="${CLAWDBOT_CLAWD_MINT:-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump}"
STARTUP_SOL_LAMPORTS="${CLAWDBOT_STARTUP_SOL_LAMPORTS:-69420000}"
STARTUP_CLAWD_TOKENS="${CLAWDBOT_STARTUP_CLAWD_TOKENS:-1000}"
AGENT_WALLET_PATH="${CLAWDBOT_AGENT_WALLET_PATH:-$INSTALL_DIR/workspace/agent-wallet.json}"
INSTALL_TRACK_FILE="${CLAWDBOT_INSTALL_TRACK_FILE:-$INSTALL_DIR/install.json}"
LOCAL_SKILLS_DIR="${CLAWDBOT_SKILLS_DIR:-$HOME/skills/skills}"
LOCAL_AGENTS_DIR="${CLAWDBOT_AGENTS_DIR:-$HOME/agents/agents/src}"
LOCAL_ZK_PRIMITIVES_DIR="${CLAWDBOT_ZK_PRIMITIVES_DIR:-$INSTALL_DIR/src/zk-primitives}"

if [[ "$INSTALL_COMPLETE" == "1" ]]; then
  INSTALL_CORE_AI=1
  if [[ -z "$INSTALL_VULCAN_EXPLICIT" ]]; then
    INSTALL_VULCAN=1
  fi
fi

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ▶${RESET} $*"; }
success() { echo -e "${GREEN}  ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }
die()     { echo -e "${RED}  ✗ ERROR:${RESET} $*" >&2; exit 1; }

# Pump.fun live tape (same ingest as https://solgpt.us/pump).
# curl|bash prebuilt installs leave REPO_DIR empty — fetch the script from
# GitHub raw (or CLAWDBOT_PUMP_TAPE_URL) when no local copy exists.
# Never fails the install. Skip with CLAWDBOT_SKIP_PUMP_TAPE=1.
run_clawd_pump_tape() {
  [[ "${CLAWDBOT_SKIP_PUMP_TAPE:-0}" == "1" ]] && return 0
  command -v node >/dev/null 2>&1 || return 0

  local tape="" tmp="" tmp_dir="" fetched=0 raw owner_repo file_path
  if [[ -n "${LOCAL_SOURCE_DIR:-}" && -f "${LOCAL_SOURCE_DIR}/scripts/pump-tape.mjs" ]]; then
    tape="${LOCAL_SOURCE_DIR}/scripts/pump-tape.mjs"
  elif [[ -n "${_INSTALLER_DIR:-}" && -f "${_INSTALLER_DIR}/scripts/pump-tape.mjs" ]]; then
    tape="${_INSTALLER_DIR}/scripts/pump-tape.mjs"
  elif [[ -n "${REPO_DIR:-}" && -f "${REPO_DIR}/scripts/pump-tape.mjs" ]]; then
    tape="${REPO_DIR}/scripts/pump-tape.mjs"
  elif [[ -f "${INSTALL_DIR}/src/scripts/pump-tape.mjs" ]]; then
    tape="${INSTALL_DIR}/src/scripts/pump-tape.mjs"
  fi

  # Local path or file:// only. HTTP(S) URLs fall through to mktemp + curl so
  # curl|bash (empty checkout) actually fetches. Do not short-circuit http(s).
  if [[ -z "$tape" && -n "${CLAWDBOT_PUMP_TAPE_URL:-}" ]]; then
    raw="${CLAWDBOT_PUMP_TAPE_URL}"
    if [[ -f "$raw" ]]; then
      tape="$raw"
    elif [[ "$raw" == file://* ]]; then
      file_path="${raw#file://}"
      if [[ -f "$file_path" ]]; then
        tape="$file_path"
      fi
    fi
  fi

  # BSD mktemp (macOS) requires XXXXXX at the end — a ".mjs" suffix after the
  # Xs fails with "mkstemp: File exists" and the fetch never runs. Create a
  # directory with XXXXXX last, then write pump-tape.mjs inside it so Node
  # still treats the file as ESM.
  if [[ -z "$tape" ]] && command -v curl >/dev/null 2>&1; then
    tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/clawdbot-pump-tape.XXXXXX" 2>/dev/null || true)"
    if [[ -n "$tmp_dir" ]]; then
      tmp="${tmp_dir}/pump-tape.mjs"
      raw="${CLAWDBOT_PUMP_TAPE_URL:-}"
      if [[ -z "$raw" || "$raw" == file://* || -f "$raw" ]]; then
        raw="${REPO%.git}/raw/${REF}/scripts/pump-tape.mjs"
      fi
      if curl -fsSL "$raw" -o "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
        tape="$tmp"
        fetched=1
      else
        owner_repo="${REPO#https://github.com/}"
        owner_repo="${owner_repo%.git}"
        if curl -fsSL "https://raw.githubusercontent.com/${owner_repo}/${REF}/scripts/pump-tape.mjs" -o "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
          tape="$tmp"
          fetched=1
        else
          rm -rf "$tmp_dir" 2>/dev/null || true
          tmp=""
          tmp_dir=""
        fi
      fi
    fi
  fi

  if [[ -n "$tape" ]]; then
    node "$tape" || true
  fi
  if [[ "$fetched" == "1" && -n "$tmp_dir" ]]; then
    rm -rf "$tmp_dir" 2>/dev/null || true
  fi
  return 0
}

# Tests / operators: run only the tape (no Go install). Used to prove the
# curl|bash fallback without executing the rest of this script.
if [[ "${CLAWDBOT_PUMP_TAPE_ONLY:-0}" == "1" ]]; then
  run_clawd_pump_tape
  exit 0
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
cat << 'EOF'
    ██████╗██╗      █████╗ ██╗    ██╗██████╗
   ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗
   ██║     ██║     ███████║██║ █╗ ██║██║  ██║
   ██║     ██║     ██╔══██║██║███╗██║██║  ██║
   ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝
    ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝
EOF
echo -e "${RESET}"
echo -e "${BOLD}  🦞 Clawd — Sovereign Solana Trading Intelligence — Installer${RESET}"
echo -e "  Free AI via zkrouter · SolanaTracker RPC included"
echo

# ── Detect OS / Arch ──────────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)        warn "Unsupported arch: $ARCH — will build from source" ;;
esac

info "Platform: ${OS}/${ARCH}"

# ── Check dependencies ────────────────────────────────────────────────────────
check_cmd() { command -v "$1" >/dev/null 2>&1; }

json_get() {
  local json="$1" key="$2"
  printf '%s' "$json" | tr '\n' ' ' | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
}

append_env_if_missing() {
  local key="$1" value="$2"
  if [[ -n "$value" && -f "$ENV_FILE" ]] && ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

github_archive_url() {
  printf "%s/archive/%s.tar.gz" "${1%.git}" "$2"
}

install_source_archive() {
  local repo_url="$1" ref="$2" dest="$3" label="$4" tmp archive root
  check_cmd curl || die "curl is required to install $label from an archive"
  check_cmd tar || die "tar is required to install $label from an archive"
  tmp="$(mktemp -d)"
  archive="$tmp/source.tar.gz"
  curl -fsSL "$(github_archive_url "$repo_url" "$ref")" -o "$archive"
  tar -xzf "$archive" -C "$tmp"
  root="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -n "$root" ]] || { rm -rf "$tmp"; die "Could not unpack $label archive"; }
  rm -rf "$dest"; mkdir -p "$(dirname "$dest")"; mv "$root" "$dest"; rm -rf "$tmp"
}

install_source_git() {
  local repo_url="$1" ref="$2" dest="$3" label="$4" tmp repo
  check_cmd git || die "git is required to install $label from git"
  tmp="$(mktemp -d)"; repo="$tmp/repo"
  if ! git clone --depth=1 --branch "$ref" --quiet "$repo_url" "$repo" 2>/dev/null; then
    rm -rf "$repo"
    git clone --depth=1 --quiet "$repo_url" "$repo"
    if ! git -C "$repo" checkout --quiet "$ref" 2>/dev/null; then
      git -C "$repo" fetch --depth=1 origin "$ref" --quiet
      git -C "$repo" checkout --quiet FETCH_HEAD
    fi
  fi
  rm -rf "$dest"; mkdir -p "$(dirname "$dest")"; mv "$repo" "$dest"; rm -rf "$tmp"
}

ensure_go_source() {
  if [[ -f "$REPO_DIR/go.mod" && -d "$REPO_DIR/cmd/clawdbot" ]]; then return; fi
  warn "Source archive missing Go CLI sources; retrying with git checkout"
  install_source_git "$REPO" "$REF" "$REPO_DIR" "clawdbot-go"
  if [[ ! -f "$REPO_DIR/go.mod" || ! -d "$REPO_DIR/cmd/clawdbot" ]]; then
    die "Downloaded source incomplete: expected go.mod and cmd/clawdbot/"
  fi
}

# ── Build from source (must be defined before use) ──────────────────────────
build_from_source() {
  info "Building clawdbot binary from Go source..."
  cd "$REPO_DIR"
  go mod download -x 2>/dev/null | tail -3 || true
  go build -buildvcs=false -trimpath -ldflags="-s -w" -o "$INSTALL_DIR/bin/clawdbot" ./cmd/clawdbot/
  success "Binary built: $INSTALL_DIR/bin/clawdbot"
}

write_core_ai_mcp_config() {
  mkdir -p "$(dirname "$CORE_AI_MCP_CONFIG")"
  cat > "$CORE_AI_MCP_CONFIG" << JSONEOF
{
  "mcpServers": {
    "helius": {
      "command": "node",
      "args": ["${CORE_AI_DIR}/helius-mcp/dist/index.js"],
      "env": {
        "HELIUS_API_KEY": "\${HELIUS_API_KEY}",
        "SOLANA_RPC_URL": "\${SOLANA_RPC_URL}"
      }
    },
    "pump-mcp": {
      "command": "node",
      "args": ["${CORE_AI_DIR}/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "\${SOLANA_RPC_URL}",
        "HELIUS_API_KEY": "\${HELIUS_API_KEY}"
      }
    },
    "zkcompression": {
      "type": "http",
      "url": "https://www.zkcompression.com/mcp"
    }
  }
}
JSONEOF
}

npm_install_and_build() {
  local package_dir="$1" label="$2"
  info "Building $label..."
  if npm --prefix "$package_dir" install --legacy-peer-deps; then
    npm --prefix "$package_dir" run build || warn "$label build failed"
  else
    warn "$label dependency install failed"
  fi
}

install_core_ai() {
  info "Installing core-ai sidecar (${CORE_AI_REF})..."
  if [[ -d "$CORE_AI_DIR/.git" ]]; then
    git -C "$CORE_AI_DIR" fetch --depth=1 origin "$CORE_AI_REF" --quiet || warn "core-ai fetch failed"
    git -C "$CORE_AI_DIR" checkout --quiet -B "$CORE_AI_REF" "origin/$CORE_AI_REF" || warn "core-ai checkout failed"
  elif [[ "$SOURCE_MODE" == "archive" ]]; then
    install_source_archive "$CORE_AI_REPO" "$CORE_AI_REF" "$CORE_AI_DIR" "core-ai"
  else
    install_source_git "$CORE_AI_REPO" "$CORE_AI_REF" "$CORE_AI_DIR" "core-ai"
  fi
  if check_cmd npm; then
    [[ -f "$CORE_AI_DIR/helius-mcp/package.json" ]] && npm_install_and_build "$CORE_AI_DIR/helius-mcp" "core-ai helius-mcp"
    [[ -f "$CORE_AI_DIR/mcp-server/package.json" ]] && npm_install_and_build "$CORE_AI_DIR/mcp-server" "core-ai pump MCP server"
  else
    warn "npm not found; core-ai source was installed but MCP packages were not built"
  fi
  write_core_ai_mcp_config
  success "core-ai sidecar ready at $CORE_AI_DIR"
}

install_vulcan() {
  if [[ "$INSTALL_VULCAN" == "0" ]]; then warn "Skipping Vulcan install (CLAWDBOT_INSTALL_VULCAN=0)"; return; fi
  if check_cmd vulcan; then success "Vulcan: $(command -v vulcan)"; return; fi
  check_cmd curl || { warn "curl not found; skipping Vulcan install"; return; }
  info "Installing Vulcan CLI for Phoenix paper/live perps..."
  curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh || warn "Vulcan install failed"
  check_cmd vulcan && success "Vulcan: $(command -v vulcan)" || warn "Vulcan not found on PATH after install"
}

prebuilt_asset_name() {
  local name="clawdbot-${OS}-${ARCH}"
  if [[ "$OS" == "windows" || "$OS" == "mingw"* ]]; then
    name="${name}.exe"
  fi
  printf '%s' "$name"
}

# Version probe: capture the full banner. `grep -q` + pipefail SIGPIPEs the
# Go CLI mid-banner (exit 141) and falsely rejects a working prebuilt.
binary_prints_clawdbot() {
  local src="$1"
  local probe
  [[ -f "$src" ]] || return 1
  probe="$("$src" version 2>/dev/null || true)"
  [[ "$probe" == *clawdbot* ]]
}

# Copy a candidate binary into dest after a version-probe (must print clawdbot).
install_candidate_binary() {
  local src="$1" dest="$2"
  [[ -f "$src" ]] || return 1
  [[ -x "$src" ]] || chmod +x "$src" 2>/dev/null || true
  binary_prints_clawdbot "$src" || return 1
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  chmod +x "$dest"
  return 0
}

# Prefer a matching prebuilt so a one-click install does not need a Go toolchain.
try_install_prebuilt() {
  local dest="$1"
  local asset
  asset="$(prebuilt_asset_name)"

  if [[ -n "${CLAWDBOT_PREBUILT:-}" ]]; then
    info "Trying CLAWDBOT_PREBUILT=${CLAWDBOT_PREBUILT}"
    if install_candidate_binary "$CLAWDBOT_PREBUILT" "$dest"; then
      success "Installed prebuilt from CLAWDBOT_PREBUILT"
      return 0
    fi
    die "CLAWDBOT_PREBUILT is set but is not a working clawdbot binary: $CLAWDBOT_PREBUILT"
  fi

  if [[ -n "${CLAWDBOT_PREBUILT_URL:-}" ]]; then
    check_cmd curl || die "curl is required to download CLAWDBOT_PREBUILT_URL"
    info "Downloading prebuilt from CLAWDBOT_PREBUILT_URL"
    curl -fsSL "$CLAWDBOT_PREBUILT_URL" -o "$dest" || die "Failed to download CLAWDBOT_PREBUILT_URL"
    chmod +x "$dest"
    if binary_prints_clawdbot "$dest"; then
      success "Installed prebuilt from URL"
      return 0
    fi
    rm -f "$dest"
    die "Downloaded CLAWDBOT_PREBUILT_URL but the file is not a working clawdbot binary"
  fi

  local search_dirs=()
  [[ -n "${LOCAL_SOURCE_DIR}" ]] && search_dirs+=("$LOCAL_SOURCE_DIR" "$LOCAL_SOURCE_DIR/build")
  [[ -n "${_INSTALLER_DIR}" ]] && search_dirs+=("$_INSTALLER_DIR" "$_INSTALLER_DIR/build")

  local dir candidate
  for dir in "${search_dirs[@]}"; do
    [[ -n "$dir" && -d "$dir" ]] || continue
    for candidate in "$dir/$asset" "$dir/clawdbot"; do
      if install_candidate_binary "$candidate" "$dest"; then
        success "Installed local prebuilt: $candidate"
        return 0
      fi
    done
  done

  if [[ "${CLAWDBOT_SKIP_GITHUB_PREBUILT:-0}" != "1" ]] && check_cmd curl; then
    local url="${CLAWDBOT_RELEASE_URL:-${REPO}/releases/latest/download/${asset}}"
    info "Trying GitHub release asset ${asset}..."
    if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
      chmod +x "$dest"
      if binary_prints_clawdbot "$dest"; then
        success "Installed prebuilt from $url"
        return 0
      fi
      rm -f "$dest"
    fi
    warn "No GitHub prebuilt for ${OS}/${ARCH} at $url"
  fi
  return 1
}

# ── Install prebuilt (no Go) or build from source ─────────────────────────────
mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/bin"
REPO_DIR=""
USED_PREBUILT=0

if try_install_prebuilt "$INSTALL_DIR/bin/clawdbot"; then
  USED_PREBUILT=1
  if [[ -n "${LOCAL_SOURCE_DIR}" ]]; then
    REPO_DIR="$LOCAL_SOURCE_DIR"
  fi
else
  if ! check_cmd go; then
    die "No matching prebuilt clawdbot binary for ${OS}/${ARCH} and Go is not installed. Download clawdbot-${OS}-${ARCH} from ${REPO}/releases or install Go from https://go.dev/dl/ then re-run."
  fi
  GO_VERSION="$(go version 2>&1 | awk '{print $3}')"
  success "Go: ${GO_VERSION}"
  check_cmd git || die "git is required to build from source. Install it and re-run, or provide a prebuilt via CLAWDBOT_PREBUILT."

  REPO_DIR="$INSTALL_DIR/src"
  if [[ -n "${LOCAL_SOURCE_DIR}" && "${CLAWDBOT_FORCE_REMOTE_SOURCE:-0}" != "1" ]]; then
    REPO_DIR="$LOCAL_SOURCE_DIR"
    info "Using local source checkout: $REPO_DIR"
  elif [[ "$SOURCE_MODE" == "archive" && ! -d "$REPO_DIR/.git" ]]; then
    info "Downloading clawdbot-go source archive (${REF})..."
    install_source_archive "$REPO" "$REF" "$REPO_DIR" "clawdbot-go"
  elif [[ -d "$REPO_DIR/.git" ]]; then
    info "Updating existing repo..."
    git -C "$REPO_DIR" pull --ff-only --quiet || warn "git pull failed — using existing tree"
  else
    info "Cloning clawdbot-go..."
    install_source_git "$REPO" "$REF" "$REPO_DIR" "clawdbot-go"
  fi
  ensure_go_source
  success "Source ready at $REPO_DIR"

  PREBUILT_BINARY="$REPO_DIR/clawdbot"
  if [[ -f "$PREBUILT_BINARY" && -x "$PREBUILT_BINARY" ]] && install_candidate_binary "$PREBUILT_BINARY" "$INSTALL_DIR/bin/clawdbot"; then
    success "Binary copied from source tree: $INSTALL_DIR/bin/clawdbot"
  else
    build_from_source
  fi
fi

# ── Install to PATH ────────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
cp "$INSTALL_DIR/bin/clawdbot" "$BIN_DIR/clawdbot"
success "Installed to $BIN_DIR/clawdbot"

if "$INSTALL_DIR/bin/clawdbot" dna --help >/dev/null 2>&1; then
  info "Generating starter agent DNA..."
  "$INSTALL_DIR/bin/clawdbot" dna generate \
    --if-missing \
    --out "$INSTALL_DIR/workspace/agent-dna.json" \
    --agent-name "Clawd Bot" \
    --role "sovereign Solana trading intelligence" || warn "Agent DNA generation failed; run: clawdbot dna generate"
else
  warn "Installed clawdbot binary does not expose dna; skipping starter DNA"
fi

# ── Agent wallet for startup funding ──────────────────────────────────────────
AGENT_DNA_ID=""
if "$INSTALL_DIR/bin/clawdbot" dna --help >/dev/null 2>&1; then
  DNA_JSON="$(CLAWDBOT_HOME="$INSTALL_DIR" "$INSTALL_DIR/bin/clawdbot" dna show --out "$INSTALL_DIR/workspace/agent-dna.json" --json 2>/dev/null || echo '{}')"
  AGENT_DNA_ID="$(json_get "$DNA_JSON" "dnaId")"
fi

AGENT_WALLET_PUBKEY=""
if "$INSTALL_DIR/bin/clawdbot" solana wallet init --help >/dev/null 2>&1; then
  info "Initializing local agent wallet..."
  WALLET_JSON="$(CLAWDBOT_HOME="$INSTALL_DIR" "$INSTALL_DIR/bin/clawdbot" solana wallet init --out "$AGENT_WALLET_PATH" --json 2>/dev/null || echo '{}')"
  AGENT_WALLET_PUBKEY="$(json_get "$WALLET_JSON" "pubkey")"
  [[ -n "$AGENT_WALLET_PUBKEY" ]] && success "Agent wallet: ${AGENT_WALLET_PUBKEY}" || warn "Agent wallet init did not return a public key"
else
  warn "Installed clawdbot binary does not expose solana wallet init"
fi

install_vulcan

# ── Add to PATH if needed ────────────────────────────────────────────────────
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_RC=""
  [[ -f "$HOME/.zshrc" ]] && SHELL_RC="$HOME/.zshrc"
  [[ -f "$HOME/.bashrc" ]] && SHELL_RC="$HOME/.bashrc"
  [[ -f "$HOME/.profile" ]] && SHELL_RC="$HOME/.profile"
  if [[ -n "$SHELL_RC" ]]; then
    echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$SHELL_RC"
    warn "Added $BIN_DIR to PATH in $SHELL_RC — restart your shell or run: export PATH=\"\$PATH:$BIN_DIR\""
  fi
fi

# ── Register install & get ID ─────────────────────────────────────────────────
info "Registering install with clawdrouter..."
INSTALL_ID=""; FUNDING_STATUS="requested"; SOL_FUNDING_SIGNATURE=""; CLAWD_FUNDING_SIGNATURE=""; ZKROUTER_KEY=""
if check_cmd curl; then
  SOURCE_VERSION="$REF"
  if [[ -n "${REPO_DIR}" && -d "${REPO_DIR}" ]]; then
    SOURCE_VERSION="$(cd "$REPO_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "$REF")"
  elif [[ -x "$INSTALL_DIR/bin/clawdbot" ]]; then
    SOURCE_VERSION="$("$INSTALL_DIR/bin/clawdbot" version 2>/dev/null | head -1 | awk '{print $2}' || echo "$REF")"
  fi
  INSTALL_PAYLOAD="$(printf '{"os":"%s","arch":"%s","version":"%s","installComplete":"%s","coreAi":"%s","vulcan":"%s","agentWalletPubkey":"%s","agentDnaId":"%s","funding":{"solLamports":%s,"clawdTokens":%s,"clawdMint":"%s","createClawdAta":true}}' \
    "$OS" "$ARCH" "$SOURCE_VERSION" "$INSTALL_COMPLETE" "$INSTALL_CORE_AI" "$INSTALL_VULCAN" \
    "$AGENT_WALLET_PUBKEY" "$AGENT_DNA_ID" "$STARTUP_SOL_LAMPORTS" "$STARTUP_CLAWD_TOKENS" "$CLAWD_MINT")"
  INSTALL_RESP="$(curl -sf -X POST "$INSTALL_API" -H "Content-Type: application/json" -d "$INSTALL_PAYLOAD" 2>/dev/null || echo '{}')"
  INSTALL_ID="$(json_get "$INSTALL_RESP" "installId")"
  ZKROUTER_KEY="$(json_get "$INSTALL_RESP" "zkrouterKey")"
  RESP_ZKROUTER_BASE="$(json_get "$INSTALL_RESP" "zkrouterBase")"
  RESP_RPC_URL="$(json_get "$INSTALL_RESP" "rpcUrl")"
  RESP_FUNDING_STATUS="$(json_get "$INSTALL_RESP" "fundingStatus")"
  SOL_FUNDING_SIGNATURE="$(json_get "$INSTALL_RESP" "solSignature")"
  CLAWD_FUNDING_SIGNATURE="$(json_get "$INSTALL_RESP" "clawdSignature")"
  [[ -n "$RESP_ZKROUTER_BASE" ]] && ZKROUTER_BASE="$RESP_ZKROUTER_BASE"
  [[ -n "$RESP_RPC_URL" ]] && RPC_URL="$RESP_RPC_URL"
  [[ -n "$RESP_FUNDING_STATUS" ]] && FUNDING_STATUS="$RESP_FUNDING_STATUS"
fi
[[ -z "$INSTALL_ID" ]] && INSTALL_ID="local-$(date +%s)" && warn "Could not reach install API — using local ID"
success "Install ID: ${INSTALL_ID}"
[[ -n "$SOL_FUNDING_SIGNATURE$CLAWD_FUNDING_SIGNATURE" ]] && success "Startup funding receipts captured" || [[ -n "$AGENT_WALLET_PUBKEY" ]] && info "Startup funding status: ${FUNDING_STATUS}"

# ── Optional local treasury funding ───────────────────────────────────────────
if [[ -n "$AGENT_WALLET_PUBKEY" && "${CLAWDBOT_LOCAL_STARTUP_FUNDING:-0}" == "1" ]]; then
  info "Running local treasury startup funding plan..."
  FUND_ARGS=("solana" "fund-agent" "$AGENT_WALLET_PUBKEY" "--json"
    "--sol-lamports" "$STARTUP_SOL_LAMPORTS"
    "--clawd" "$STARTUP_CLAWD_TOKENS" "--clawd-mint" "$CLAWD_MINT"
    "--ledger" "$INSTALL_DIR/workspace/install-funding.jsonl")
  [[ "${CLAWDBOT_BIRTH_FUNDING_SEND:-0}" == "1" ]] && FUND_ARGS+=("--send")
  LOCAL_FUNDING_JSON="$(CLAWDBOT_HOME="$INSTALL_DIR" CLAWDBOT_INSTALL_ID="$INSTALL_ID" "$INSTALL_DIR/bin/clawdbot" "${FUND_ARGS[@]}" 2>/dev/null || echo '{}')"
  LOCAL_FUNDING_STATUS="$(json_get "$LOCAL_FUNDING_JSON" "status")"
  LOCAL_SOL_SIG="$(json_get "$LOCAL_FUNDING_JSON" "solSignature")"
  LOCAL_CLAWD_SIG="$(json_get "$LOCAL_FUNDING_JSON" "clawdSignature")"
  [[ -n "$LOCAL_FUNDING_STATUS" ]] && FUNDING_STATUS="local_${LOCAL_FUNDING_STATUS}" && info "Local startup funding: ${FUNDING_STATUS}"
  [[ -n "$LOCAL_SOL_SIG" ]] && SOL_FUNDING_SIGNATURE="$LOCAL_SOL_SIG"
  [[ -n "$LOCAL_CLAWD_SIG" ]] && CLAWD_FUNDING_SIGNATURE="$LOCAL_CLAWD_SIG"
fi

# ── Local install receipt ─────────────────────────────────────────────────────
mkdir -p "$(dirname "$INSTALL_TRACK_FILE")"
cat > "$INSTALL_TRACK_FILE" << JSONEOF
{
  "installId": "${INSTALL_ID}",
  "os": "${OS}",
  "arch": "${ARCH}",
  "agentWalletPubkey": "${AGENT_WALLET_PUBKEY}",
  "agentWalletKeypair": "${AGENT_WALLET_PATH}",
  "agentDnaId": "${AGENT_DNA_ID}",
  "funding": {
    "status": "${FUNDING_STATUS}",
    "solLamports": ${STARTUP_SOL_LAMPORTS},
    "clawdTokens": ${STARTUP_CLAWD_TOKENS},
    "clawdMint": "${CLAWD_MINT}",
    "solSignature": "${SOL_FUNDING_SIGNATURE}",
    "clawdSignature": "${CLAWD_FUNDING_SIGNATURE}"
  },
  "registeredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONEOF
success "Install receipt written to $INSTALL_TRACK_FILE"

# ── Write .env ────────────────────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  info "Writing default .env..."
  cat > "$ENV_FILE" << ENVEOF
# ════════════════════════════════════════════════════════════════════
# Clawd Bot Environment — generated by installer
# Edit this file to add your own API keys
# ════════════════════════════════════════════════════════════════════

# ── Install identity ──────────────────────────────────────────────
CLAWDBOT_INSTALL_ID=${INSTALL_ID}
CLAWDBOT_AGENT_DNA_ID=${AGENT_DNA_ID}
CLAWDBOT_INSTALL_RECEIPT=${INSTALL_TRACK_FILE}

# ── Free AI via zk.x402.wtf / zkrouter (no key needed) ───────────
ZKROUTER_BASE_URL=${ZKROUTER_BASE}
ZKROUTER_API_KEY=${ZKROUTER_KEY:-clawdbot-free}

# ── Solana RPC (SolanaTracker-backed, no key needed) ─────────────
SOLANA_RPC_URL=${RPC_URL}
HELIUS_RPC_URL=${RPC_URL}

# ── Local Clawd catalogs (instant read-only discovery) ───────────
# Prefer bundled RH pack under install home when present after install.
CLAWDBOT_SKILLS_DIR=${LOCAL_SKILLS_DIR}
CLAWDBOT_AGENTS_DIR=${LOCAL_AGENTS_DIR}
CLAWDBOT_ZK_PRIMITIVES_DIR=${LOCAL_ZK_PRIMITIVES_DIR}
CLAWDBOT_MERGE_BUNDLED_SKILLS=1

# ── Optional: bring your own keys for higher limits ──────────────
# OPENROUTER_API_KEY=sk-or-...
# HELIUS_API_KEY=your-helius-key
# BIRDEYE_API_KEY=your-birdeye-key

# ── Wallet (required for live trading) ───────────────────────────
AGENT_WALLET_PUBLIC_KEY=${AGENT_WALLET_PUBKEY}
AGENT_WALLET_KEYPAIR=${AGENT_WALLET_PATH}
SOLANA_WALLET_PUBKEY=${AGENT_WALLET_PUBKEY}
SOLANA_WALLET_KEYPAIR=${AGENT_WALLET_PATH}

# ── Startup funding request / receipts ───────────────────────────
CLAWD_TOKEN_MINT=${CLAWD_MINT}
CLAWDBOT_STARTUP_SOL_LAMPORTS=${STARTUP_SOL_LAMPORTS}
CLAWDBOT_STARTUP_CLAWD_TOKENS=${STARTUP_CLAWD_TOKENS}
CLAWDBOT_INSTALL_FUNDING_STATUS=${FUNDING_STATUS}
CLAWDBOT_SOL_FUNDING_SIGNATURE=${SOL_FUNDING_SIGNATURE}
CLAWDBOT_CLAWD_FUNDING_SIGNATURE=${CLAWD_FUNDING_SIGNATURE}
# CLAWDBOT_LOCAL_STARTUP_FUNDING=1
# CLAWDBOT_BIRTH_FUNDING_SEND=1
# CLAWDBOT_TREASURY_KEYPAIR=~/.config/solana/id.json

# ── Optional core-ai sidecar ──────────────────────────────────────
# Complete install: curl ... | CLAWDBOT_INSTALL_COMPLETE=1 bash
# CLAWDBOT_INSTALL_CORE_AI=${INSTALL_CORE_AI}
# CLAWDBOT_INSTALL_VULCAN=${INSTALL_VULCAN}
# CLAWDBOT_CORE_AI_DIR=${CORE_AI_DIR}
# CLAWDBOT_CORE_AI_MCP_CONFIG=${CORE_AI_MCP_CONFIG}
ENVEOF
  success ".env written to $ENV_FILE"
else
  warn ".env already exists at $ENV_FILE — not overwriting"
fi

append_env_if_missing "CLAWDBOT_AGENT_DNA_ID" "$AGENT_DNA_ID"
append_env_if_missing "CLAWDBOT_INSTALL_RECEIPT" "$INSTALL_TRACK_FILE"
append_env_if_missing "AGENT_WALLET_PUBLIC_KEY" "$AGENT_WALLET_PUBKEY"
append_env_if_missing "AGENT_WALLET_KEYPAIR" "$AGENT_WALLET_PATH"
append_env_if_missing "SOLANA_WALLET_PUBKEY" "$AGENT_WALLET_PUBKEY"
append_env_if_missing "SOLANA_WALLET_KEYPAIR" "$AGENT_WALLET_PATH"
append_env_if_missing "CLAWDBOT_SKILLS_DIR" "$LOCAL_SKILLS_DIR"
append_env_if_missing "CLAWDBOT_AGENTS_DIR" "$LOCAL_AGENTS_DIR"
append_env_if_missing "CLAWDBOT_ZK_PRIMITIVES_DIR" "$LOCAL_ZK_PRIMITIVES_DIR"
# Browser-direct Connect from https://cheshireterminal.ai/zeroclawd
append_env_if_missing "CLAWDBOT_CORS_ORIGINS" "https://cheshireterminal.ai"

# Symlink config into home
if [[ ! -L "$HOME/.clawdbot" && "$INSTALL_DIR" != "$HOME/.clawdbot" ]]; then
  ln -sfn "$INSTALL_DIR" "$HOME/.clawdbot"
fi

# ── Optional core-ai sidecar ─────────────────────────────────────────────────
if [[ "$INSTALL_CORE_AI" == "1" ]]; then
  install_core_ai
  if [[ -f "$ENV_FILE" ]] && ! grep -q '^CLAWDBOT_CORE_AI_DIR=' "$ENV_FILE"; then
    cat >> "$ENV_FILE" << ENVEOF

# ── core-ai sidecar ───────────────────────────────────────────────
CLAWDBOT_INSTALL_COMPLETE=${INSTALL_COMPLETE}
CLAWDBOT_INSTALL_CORE_AI=${INSTALL_CORE_AI}
CLAWDBOT_INSTALL_VULCAN=${INSTALL_VULCAN}
CLAWDBOT_CORE_AI_DIR=${CORE_AI_DIR}
CLAWDBOT_CORE_AI_REF=${CORE_AI_REF}
CLAWDBOT_CORE_AI_MCP_CONFIG=${CORE_AI_MCP_CONFIG}
ENVEOF
  fi
fi

# ── Bundle RH / Cheshire skill pack from this repo ────────────────────────────
BUNDLED_SKILLS=""
if [[ -n "${REPO_DIR}" && -f "$REPO_DIR/skills/pack-index.json" ]]; then
  BUNDLED_SKILLS="$REPO_DIR/skills"
fi
if [[ -n "$BUNDLED_SKILLS" && -f "$BUNDLED_SKILLS/pack-index.json" ]]; then
  info "Installing bundled RH skill pack → $INSTALL_DIR/skills"
  mkdir -p "$INSTALL_DIR/skills"
  # Prefer rsync; fall back to cp -R
  if check_cmd rsync; then
    rsync -a --delete --exclude node_modules "$BUNDLED_SKILLS/" "$INSTALL_DIR/skills/"
  else
    rm -rf "$INSTALL_DIR/skills"
    cp -R "$BUNDLED_SKILLS" "$INSTALL_DIR/skills"
  fi
  LOCAL_SKILLS_DIR="$INSTALL_DIR/skills"
  append_env_if_missing "CLAWDBOT_SKILLS_DIR" "$LOCAL_SKILLS_DIR"
  # Symlink into common agent skill roots (best-effort)
  for _agent_root in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills"; do
    mkdir -p "$_agent_root"
    if [[ -d "$INSTALL_DIR/skills" ]]; then
      for _skill in "$INSTALL_DIR/skills"/*/; do
        [[ -d "$_skill" ]] || continue
        _id="$(basename "$_skill")"
        [[ -f "${_skill}SKILL.md" ]] || continue
        ln -sfn "$_skill" "$_agent_root/$_id" 2>/dev/null || true
      done
    fi
  done
  success "RH skill pack ready: $LOCAL_SKILLS_DIR"
else
  if [[ "$USED_PREBUILT" == "1" ]]; then
    info "Prebuilt binary embeds the RH skill pack; no source checkout needed for catalog"
  else
    warn "Bundled skills/pack-index.json missing in source tree"
  fi
fi

# ── Birth skill seed ──────────────────────────────────────────────────────────
# By default this opens the interactive `skills add` picker so you choose which
# skills/agents to install, instead of installing everything instantly. Set
# CLAWDBOT_SKILLS_ALL=1 to skip the picker (also the automatic fallback when
# stdin isn't a real terminal, e.g. curl | bash with no TTY attached).
if [[ "${CLAWDBOT_SKIP_SKILL_SEED:-0}" != "1" ]]; then
  if check_cmd npx; then
    _skill_seed_args=()
    if [[ "${CLAWDBOT_SKILLS_ALL:-0}" == "1" ]] || [[ ! -t 0 ]]; then
      _skill_seed_args=(--all)
      [[ -t 0 ]] || info "No interactive terminal detected; installing all birth skills non-interactively."
    fi
    info "Seeding birth skills from Solizardking/skills..."
    npx skills add https://github.com/Solizardking/skills "${_skill_seed_args[@]}" || warn "Solizardking skill seed failed"
    info "Seeding Go runtime skills from samber/cc-skills-golang..."
    npx skills add https://github.com/samber/cc-skills-golang "${_skill_seed_args[@]}" || warn "Go skill seed failed"
  else
    warn "npx not found; skipping birth skill seed"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  🦞 Clawd Bot installed successfully!${RESET}"
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════${RESET}"
echo
echo -e "  ${BOLD}Get started:${RESET}"
echo -e "  ${CYAN}source ${ENV_FILE}${RESET}          # load env vars"
echo -e "  ${CYAN}clawdbot version${RESET}             # verify install"
echo -e "  ${CYAN}clawdbot dna show${RESET}            # inspect starter DNA"
echo -e "  ${CYAN}clawdbot agent${RESET}               # AI REPL (free via zkrouter)"
echo -e "  ${CYAN}clawdbot ooda --sim${RESET}          # paper trading mode"
echo -e "  ${CYAN}clawdbot skills birth --install${RESET} # reseed skills"
echo -e "  ${CYAN}clawdbot catalog skills${RESET}      # RH pack + birth skills"
echo -e "  ${CYAN}clawdbot solana trending${RESET}     # top Solana tokens"
echo -e "  ${CYAN}clawdbot web${RESET}                 # local web console → http://127.0.0.1:${WEB_PORT}"
echo -e "  ${CYAN}# npm oneshot (skills): curl -fsSL ${REPO}/raw/main/install-npm.sh | bash${RESET}"
[[ "$INSTALL_CORE_AI" == "1" ]] && echo -e "  ${CYAN}${CORE_AI_MCP_CONFIG}${RESET}  # core-ai MCP config"
echo
echo -e "  ${BOLD}Connect from Cheshire Terminal:${RESET}"
echo -e "  1. Start the console:  ${CYAN}clawdbot web${RESET}  (default ${CYAN}http://127.0.0.1:${WEB_PORT}${RESET})"
echo -e "  2. Allow the hosted page to probe loopback (browser-direct):"
echo -e "     ${CYAN}export CLAWDBOT_CORS_ORIGINS=https://cheshireterminal.ai${RESET}"
echo -e "  3. Open ${CYAN}${ZERO_CLAWD_URL}${RESET}"
echo -e "     (aliases: ${TERMINAL_URL}/clawdbot-go · ${TERMINAL_URL}/clawdbot)"
echo -e "  4. Connect agent base URL ${CYAN}http://127.0.0.1:${WEB_PORT}${RESET} → health/status/DNA + chat"
echo
echo -e "  ${BOLD}Edit your config:${RESET}  ${CYAN}nano ${ENV_FILE}${RESET}"
[[ -n "$AGENT_WALLET_PUBKEY" ]] && echo -e "  ${BOLD}Agent wallet:${RESET}     ${CYAN}${AGENT_WALLET_PUBKEY}${RESET}"
echo -e "  ${BOLD}Runtime repo:${RESET}      ${CYAN}${REPO}${RESET}"
echo -e "  ${BOLD}Ecosystem hub:${RESET}    ${CYAN}${HUB_REPO}${RESET}"
echo -e "  ${BOLD}Gateway:${RESET}          ${CYAN}https://zk.x402.wtf${RESET}"
echo -e "  ${BOLD}Terminal:${RESET}         ${CYAN}${TERMINAL_URL}${RESET}"
echo -e "  ${BOLD}Clawd Bot hub:${RESET}   ${CYAN}${ZERO_CLAWD_URL}${RESET}"
echo -e "  ${BOLD}Agent hub:${RESET}        ${CYAN}${AGENT_HUB_URL}${RESET}"
echo -e "  ${BOLD}Agent forge:${RESET}      ${CYAN}${AGENT_FORGE_URL}${RESET}"
echo
run_clawd_pump_tape

echo -e "  🦞 \$CLAWD :: Droids Lead The Way"