# Robinhood Crypto Agent Open Stack

Open-source skill pack for **anyone** building **FunPump** / Robinhood Chain / EVM trading and agent tooling with Clawd Bot (`go-bot` / `clawdbot`).

**Product host:** [https://funpump.ai](https://funpump.ai)  
**Clawd Bot:** [https://cheshireterminal.ai/zeroclawd](https://cheshireterminal.ai/zeroclawd)  
**Agent hub:** [https://cheshireterminal.ai/agents](https://cheshireterminal.ai/agents)  
**Agent forge:** [https://cheshireterminal.ai/agents/forge](https://cheshireterminal.ai/agents/forge)  
**Do not use** `clawdcode.net` — launches and public APIs are on **funpump.ai**.

This pack ships with the go-bot tree (`pack-index.json` + `catalog.json` + one folder per skill). No private monorepo paths required.

## Pack files

| File | Role |
|------|------|
| `pack-index.json` | Authoritative skill id list + product hosts |
| `catalog.json` | Flat catalog (slug, description, category, tags) for loaders |
| `*/SKILL.md` | Agent skill bodies |

Current **skillCount:** see `pack-index.json` (23 skills).

## Skills

### FunPump launch (RH 4663)

| Skill | Role |
|-------|------|
| `rh-launchpad-v3` | Bonding curve → **Uniswap V3** · factory `0x27f27F998fdBa2a38C136Bb3E7a8BA43155798Cd` · API `https://funpump.ai/api/launchpad/v3` |
| `rh-bonded-launch` | Bonding `createToken` · active factory `0x6344a4c108b8fe03e9d79523ab0ac588a45cd092` · UI `https://funpump.ai/launch` |

### Cheshire agent registries (ERC-8004)

| Skill | Role |
|-------|------|
| `cheshire-agent-registries` | Suite overview + mainnet pins |
| `cheshire-agent-identity-registry` | RHAGENT ERC-721 · `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` |
| `cheshire-agent-reputation-registry` | Client feedback · `0x8a4154a6c1ee44b4b790948f9613e3fb934628ff` |
| `cheshire-agent-validation-registry` | Validation request/response · `0x020d053040da31195e5f9a992b8eda663dbb073b` |
| `cheshire-omni-mint` | Dual-rail Solana Metaplex + RH identity + zk-omni link |
| `cheshire-zk-omni` | LayerZero msgType 4 nullifier messenger |

### Trading / Uniswap / strategy

| Skill | Role |
|-------|------|
| `swap-planner` / `swap-integration` | Swaps |
| `liquidity-planner` / `lp-integration` | LP positions |
| `v4-hook-generator` / `v4-sdk-integration` / `v4-security-foundations` | Uniswap v4 |
| `viem-integration` | EVM client patterns |
| `copy-trade` / `dca-bot` / `index-bot` | Strategy bots |
| `deployer` | CCA factory deploy |
| `pay-with-any-token` / `pay-with-app` | HTTP 402 / MPP payments |
| `web3-dev` | Blockscout PRO multichain |

## One-shot install (Grok Build style)

```bash
# npm stack — skills + ~/.agents links + env (recommended)
curl -fsSL https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install-npm.sh | bash

# or pure npx
npx clawdbot-go install
```

This copies the pack to `~/.clawdbot/skills`, links into `~/.agents/skills`,
and writes `CLAWDBOT_SKILLS_DIR` in `~/.clawdbot/.env`.

## Point clawdbot at this pack

```bash
cd go-bot
export CLAWDBOT_SKILLS_DIR="$(pwd)/skills"
clawdbot catalog skills
# or
go run ./cmd/clawdbot catalog skills --skills-dir ./skills
```

When `CLAWDBOT_SKILLS_DIR` is unset, go-bot prefers this bundled `./skills` directory if `pack-index.json` is present.

## Redistribute to Cheshire / npm / SkillHub

| Surface | URL |
|---------|-----|
| **npm** | [cheshire-terminal-agents](https://www.npmjs.com/package/cheshire-terminal-agents) — agent catalog + forge SDK + RH skill pack (skills only, not the Go binary) |
| **Agents source** | [Solizardking/Cheshire-Terminal-Agents](https://github.com/Solizardking/Cheshire-Terminal-Agents) |
| **SkillHub** | [Solizardking/skillhub-main](https://github.com/Solizardking/skillhub-main) — broader Solizardking installable skills library |
| **Agent hub** | [cheshireterminal.ai/agents](https://cheshireterminal.ai/agents) |
| **Clawd Bot** | [cheshireterminal.ai/zeroclawd](https://cheshireterminal.ai/zeroclawd) |

```bash
# npm consumers
npm i cheshire-terminal-agents

# SkillHub (skills CLI)
npx skills add https://github.com/Solizardking/skillhub-main --all

# From ClawdBrowser monorepo root — sync go-bot skills into Cheshire packaging
node scripts/sync-go-bot-rh-skills-to-robinhood-agents.mjs
node --experimental-strip-types --test scripts/go-bot-rh-integration-unit.test.ts
```

Also mirrored under `cheshire-terminal/robinhood-agents/skills/` for many skills.

## Core env (RH)

| Var | Purpose |
|-----|---------|
| `RH_RPC_URL` | Robinhood mainnet RPC (chain **4663**) |
| `BLOCKSCOUT_API_KEY` | Blockscout PRO REST (`web3-dev`) + MCP (`blockscout-analysis`) |

See `.env.example` and `docs/RH_CRYPTO_AGENT_STACK.md`.

## TUI

- Go launcher: `go-bot/cmd/clawdbot-tui` (FunPump / registries panels)
- TypeScript ZK Shark: `cheshire-terminal/packages/clawd-agent-tui` (`/skills` `/launch` `/registries` `/omni`)

## License

Same as the parent repository (MIT) unless individual skill files note otherwise.
