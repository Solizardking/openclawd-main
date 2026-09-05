# Clawd Bot — `pkg/` map

Every directory under [`pkg/`](../pkg/) is a Go package.  
Use this page when you need “where does X live?” without reading the whole tree.

**Count:** 56 packages · **CLI entry:** [`cmd/clawdbot`](../cmd/clawdbot) · **Web API:** [`pkg/webconsole`](../pkg/webconsole) (in-process `clawdbot web`) · **Solana Mobile:** [`mobile/`](../mobile/)

---

## How to read this

| Column | Meaning |
|--------|---------|
| **Package** | Import path suffix under `github.com/8bitlabs/clawdbot/pkg/…` |
| **Role** | What operators / agents get from it |
| **Try** | Fast local command (when applicable) |

---

## Core agent loop

| Package | Role | Try |
|---------|------|-----|
| **agent** | Prompts, soul loading (`SOUL.md`), tool execution hooks | `clawdbot agent` |
| **session** | Chat session history | — |
| **memory** | ClawVault + optional Supabase memory engine | — |
| **tools** | Tool interface + registry (built-ins plug in here) | — |
| **commands** | Chat command registry | — |
| **routing** | Multi-agent message routing | — |
| **laws** | Six-law runtime harness | — |
| **dna** | Synthetic agent DNA (`agent-dna.json`, `clawd.agent.dna/v1`) | `clawdbot dna show` |
| **identity** | Sender / agent identity resolution | — |
| **state** | Persistent agent state | — |
| **heartbeat** | Periodic heartbeat messages | — |
| **health** | System health checks | `clawdbot doctor` |
| **doctor** | Local runtime diagnostics (connectors, RH, MCP) | `clawdbot doctor` |

## Models & research

| Package | Role | Try |
|---------|------|-----|
| **providers** | LLM provider abstraction (Moonshot, OpenRouter, xAI, …) | — |
| **godmode** | Multi-model race + STM cleaners | `clawdbot zero run --god …` |
| **research** | Autonomous experiment / Dexter-style research loop | — |
| **middleout** | Content-cache, Ralph loop, content router | — |
| **perfbench** | Lightweight performance smoke bench | — |
| **zero** | Flat FIFO task queue, ZK run attestation, intent router | `clawdbot zero run` / `zero ask` |

## Trading & markets (Solana)

| Package | Role | Try |
|---------|------|-----|
| **solana** | Birdeye, Helius, Jupiter, trending, wallet ops | `clawdbot solana trending` |
| **trading** | Risk / readiness primitives for live paths | — |
| **strategy** | RSI + EMA cross + ATR signal engine | — |
| **ooda** | Wrapper for TypeScript OODA paper/devnet harness | `clawdbot ooda --sim` |
| **phoenix** | Phoenix perps types + tx helpers | — |
| **vulcan** | Vulcan CLI wrapper for Phoenix paper/live | `vulcan` (external) |
| **aster** | Aster DEX perps (HMAC-signed) | — |
| **wallet** | Local Solana keypair helpers | `clawdbot solana wallet init` |
| **birthfund** | Explicit agent birth funding plans | — |

Hosted **SOL GPT** research catalog (72 non-custodial tools: Phoenix, Birdeye, Helius, DFlow, browser) lives in the product UI — full list: [`SOL_GPT_TOOLS.md`](SOL_GPT_TOOLS.md).

## Robinhood Chain / omni

| Package | Role | Try |
|---------|------|-----|
| **rh** | RH 4663 JSON-RPC + Blockscout PRO + readiness | `GET /api/rh/readiness` |
| **zkomni** | RH ↔ Solana ZK omnichain (msgType 4) + zk-shark-agent sidecar (`./zk-primitives/agent`) | `clawdbot zero zkomni inspect` |
| **mcp** | MCP server wiring (incl. Blockscout MCP) | `GET /api/mcp/blockscout` |

## Skills, catalog, install

| Package | Role | Try |
|---------|------|-----|
| **skills** | Skill discovery + birth seed | `clawdbot skills birth --install` |
| **catalog** | Skills + agents + ZK index (embedded RH + train2earn + skillhub-main pack when cwd is not the repo) | `clawdbot catalog` |
| **config** | Env/config + RH settings + version ldflags | — |
| **constants** | Product constants (`AppName` = Clawd Bot) | — |
| **bundled** | Embedded RH/EVM skill pack extracted when cwd is not the repo | `clawdbot catalog skills` |
| **webconsole** | In-process web dashboard + `/api/health` (no `go run`) | `clawdbot web --no-browser` |
| **e2bcomputer** | E2B sandbox computer — template metadata, spawn/kill, token-gated exec | `GET /api/e2b/computer` |
| **release** | Slim source package + binary inventory (no secrets/caches) | `make release-check` / `make package` |
| **keyvault** | Local env vault + IP allowlist for `/api/keys` | — |
| **migrate** | Config migration helpers | — |

## Channels & UX

| Package | Role | Try |
|---------|------|-----|
| **channels** | Telegram / Discord / multi-channel gateway | — |
| **bus** | Inter-component message bus | — |
| **auth** | OAuth / token management | — |
| **devices** | Device / sensor management | — |
| **hardware** | Arduino Modulino® I2C | — |
| **media** | Media file lifecycle | — |
| **voice** | Audio transcription | — |
| **spinner** | Themed terminal spinners | — |
| **clawdcode** | Local Clawd Code TypeScript harness wrapper | — |
| **cron** | Scheduled tasks | — |

## Utilities & lineage

| Package | Role | Try |
|---------|------|-----|
| **fileutil** | File helpers | — |
| **utils** | Shared utilities | — |
| **logger** | Structured logging | — |
| **gameoflife** | Conway Life (PiedPiper lineage) | — |
| **weissman** | Footprint / compression-style scoring | — |

---

## Dependency sketch (operator view)

```
cmd/clawdbot ──► config · agent · providers · tools · skills · catalog
                     │
                     ├─ solana · trading · strategy · ooda · vulcan · phoenix
                     ├─ rh · mcp · zkomni
                     ├─ dna · laws · doctor · wallet · birthfund
                     └─ zero · godmode · memory · session

web/backend ──► same packages for /api/health · /api/status · /api/dna · chat
```

---

## Related docs

| Doc | Why |
|-----|-----|
| [`README.md`](../README.md) | Install + connect + CLI |
| [`CHESHIRE_CLIENT.md`](CHESHIRE_CLIENT.md) | SPA ↔ local agent |
| [`SOL_GPT_TOOLS.md`](SOL_GPT_TOOLS.md) | 72-tool SOL GPT catalog |
| [`RH_CRYPTO_AGENT_STACK.md`](RH_CRYPTO_AGENT_STACK.md) | Open RH/EVM skill pack |
| [`CLAWD_CLOUD_ATTACH.md`](CLAWD_CLOUD_ATTACH.md) | Clawd Cloud sidecar map (discovery, not a vendor copy) |
| [`ZERO.md`](ZERO.md) | Zero engine invariants |
