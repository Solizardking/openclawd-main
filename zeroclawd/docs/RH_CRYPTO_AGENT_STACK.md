# Robinhood Crypto Agent Open Stack

**Anyone can use this.** Clawd Bot (`go-bot` / `clawdbot`) ships an open-source
Robinhood Chain / EVM crypto-agent skill pack under [`../skills`](../skills).

No private monorepo paths, no paid gate to *read* the skills. You bring your own
wallet, RPC, and risk limits for live execution.

## What it is

A redistributable skill pack for agent hosts (Claude Code, Codex, clawdbot, etc.)
covering:

| Area | Skills |
|------|--------|
| Robinhood launch | `rh-bonded-launch`, `rh-launchpad-v3` |
| Swaps / Uniswap | `swap-planner`, `swap-integration`, `v4-sdk-integration`, `v4-hook-generator`, `v4-security-foundations` |
| Liquidity | `liquidity-planner`, `lp-integration` |
| Strategy bots | `copy-trade`, `dca-bot`, `index-bot` |
| Auctions / CCA | `deployer` |
| Payments | `pay-with-any-token`, `pay-with-app` |
| EVM primitives | `viem-integration` |
| On-chain data (Blockscout) | `web3-dev` (PRO REST), `blockscout-analysis` (MCP) |

Pack metadata: `skills/pack-index.json` · flat catalog: `skills/catalog.json`.

## Core env (required for RH launch / deploy / trade)

| Variable | Role |
|----------|------|
| `BLOCKSCOUT_API_KEY` | Blockscout PRO key (`proapi_…`) for chain **4663** explorer data **and** hosted MCP (`Blockscout-MCP-Pro-Api-Key`). Free tier: [dev.blockscout.com](https://dev.blockscout.com) |
| `RH_RPC_URL` | Robinhood Chain JSON-RPC. Public `https://rpc.mainnet.chain.robinhood.com` is a **read-only** fallback when unset — set a private RPC for deploy/broadcast. |
| `BLOCKSCOUT_MCP_URL` | Optional override for MCP endpoint (default `https://mcp.blockscout.com/mcp`) |

Go runtime loads both via `pkg/config` (`RobinhoodConfig`) and exposes presence-only status on `/api/connectors`, **`GET /api/rh/readiness`**, **`GET /api/mcp/blockscout`**, and `clawdbot doctor` (`connectors.robinhood`, `connectors.blockscout_mcp`). Thin clients + gate: `pkg/rh` (`FromConfig`, `AssessReadiness`, `RequireReadiness`). MCP host wiring + REST tool calls: `pkg/mcp` (`DefaultConfigWithBlockscout`, `CallREST`, Cursor/Claude/Codex host configs).

## Install / resolve (clean clone)

**One-shot (npm / curl — Grok Build style):**

```bash
curl -fsSL https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install-npm.sh | bash
# or: npx clawdbot-go install
# installs pack → ~/.clawdbot/skills + agent skill dirs + .env
```

```bash
cd go-bot   # this repository

# Option A — default discovery (bundled ./skills, or the pack embedded in the binary)
unset CLAWDBOT_SKILLS_DIR
clawdbot catalog skills
# works from any working directory; the binary extracts the RH pack plus
# train2earn/skills/skills and github.com/Solizardking/skillhub-main/skills
# or during development:
go run ./cmd/clawdbot catalog skills --skills-dir ./skills

# Option B — explicit env (recommended for scripts / CI)
export CLAWDBOT_SKILLS_DIR="$(pwd)/skills"
clawdbot catalog skills
```

Environment variables:

| Variable | Role |
|----------|------|
| `CLAWDBOT_SKILLS_DIR` | Skill catalog root (defaults to bundled `./skills` when found, else `~/skills/skills`) |
| `CLAWDBOT_MERGE_BUNDLED_SKILLS` | Set to `0` to disable additive merge of the RH pack when using another skills dir |

Solana-first libraries remain supported: point `CLAWDBOT_SKILLS_DIR` at your
Solana skill tree. When the go-bot checkout is on disk, catalog reports **merge**
the RH/EVM pack by default so Solana + Robinhood skills coexist.

## CLI

```bash
clawdbot catalog                 # full report (skills + agents + zk)
clawdbot catalog skills          # skill list (includes RH pack when resolved)
clawdbot catalog skills rh       # filter query example
```

## Safety

- Skills are **documentation + agent procedures**, not auto-executing wallets.
- Live RH mainnet, Uniswap, and payment flows require keys you control; never
  commit private keys (see `SECURITY.md` and Clawd Guard patterns).
- Bonded launch factories may be source-verified but unaudited — use small amounts.

## Relationship to ClawdBrowser, npm, and SkillHub

The same skill content is developed under ClawdBrowser `.agents/skills/` and
vendored into `go-bot/skills/` so the open runtime can be cloned standalone.

| Surface | URL | What you get |
|---------|-----|----------------|
| **npm** | [cheshire-terminal-agents](https://www.npmjs.com/package/cheshire-terminal-agents) | Agent catalog + dual-chain forge SDK + RH crypto-agent skills (skills only — not the Go binary); often under `skills/rh-crypto-agent/` |
| **Agents source** | [Solizardking/Cheshire-Terminal-Agents](https://github.com/Solizardking/Cheshire-Terminal-Agents) | Canonical source for the npm package |
| **SkillHub** | [Solizardking/skillhub-main](https://github.com/Solizardking/skillhub-main) | Broader Solizardking installable skills library for agent hosts |
| **Agent hub** | [cheshireterminal.ai/agents](https://cheshireterminal.ai/agents) | Hosted catalog + live agent feed |
| **Agent forge** | [cheshireterminal.ai/agents/forge](https://cheshireterminal.ai/agents/forge) | Dual-chain identity forge UI |
| **Clawd Bot** | [cheshireterminal.ai/zeroclawd](https://cheshireterminal.ai/zeroclawd) | Product surface for this Go runtime |
| **Go runtime** | this repo `skills/` | Authoritative pack for `clawdbot catalog` when `pack-index.json` is present |

```bash
# npm
npm i cheshire-terminal-agents

# SkillHub (skills CLI)
npx skills add https://github.com/Solizardking/skillhub-main --all

# From ClawdBrowser monorepo — sync go-bot skills into Cheshire packaging
node scripts/sync-go-bot-rh-skills-to-robinhood-agents.mjs
# unit: node --experimental-strip-types --test scripts/go-bot-rh-integration-unit.test.ts
```

Operators:

```bash
export CLAWDBOT_SKILLS_DIR="$(npm root)/cheshire-terminal-agents/skills/rh-crypto-agent"
clawdbot catalog skills
```

Out of scope for the npm package (stay in go-bot): `cmd/`, `pkg/`, `build/`,
`dist/`, `web/`, `ui/`, `ooda/`, `automaton-main/`, `zk-primitives/`, binaries.
