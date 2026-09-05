# Clawd Cloud attach (sidecar + discovery)

How [Clawd Cloud](https://github.com/Solizardking/clawd-cloud) relates to this Go runtime. **This document is the attach map, not an implementation.** Do not vendor the Cloud monorepo.

Local analysis checkout: `/Users/8bit/Downloads/clawd-cloud`. Scratch inventory/logs: goal implementer dir.

## Recommendation

**Sidecar-plus-discovery.** Cloud stays its own Node/TS checkout. go-bot later reads a Cloud root env (documented here as `CLAWD_CLOUD_ROOT`) and lists destinations + capabilities. Do not copy Cloud `node_modules`, `dist`, `membrane.db*`, lockfiles-as-product, or secrets.

ZK owner is **this repo’s `./zk-primitives`** (`CLAWDBOT_ZK_PRIMITIVES_DIR`). Cloud’s `zk-primitives/` is a duplicate sidecar.

Proof of “they can see each other” does **not** need live RPC, a funded wallet, or live orders:

- Cloud: `npm run stack:doctor` and `./claw cloud` (keyless).
- go-bot: `clawdbot catalog` / `clawdbot doctor` (existing checks).

Trading stays PAPER unless Cloud’s `LIVE_TRADING=true` **and** `OPERATOR_CONFIRMED=true` **and** `PERPS_SIM_ONLY=false` (Cloud) / go-bot Vulcan default `paper`.

## Cloud integration contract (facts)

From Cloud `MANIFEST.json` + `clawd-core/src/cloud-map.mjs`, confirmed live (`./claw cloud`, 8/8 `cloud.test.mjs`, `stack:doctor` Stack OK):

- **32 destinations** = 22 `required` + 10 `additional`. Each has `layer` plus a communication target (`kind` + `invoke` and/or `endpoint`). `missingTargets=[]`.
- **Operator:** `./claw` and `./clawd` both `exec node v3/src/index.mjs`. Aliases `operator` / `claw` / `clawd` → `v3`.
- **Capabilities** (addressable without live RPC / wallet / orders):

| Capability | Aliases | Destinations | Primary |
|---|---|---|---|
| `chain` | `mcp` | `clawd-mcp`, `clawd-connectors`, `solana-mcp`, `mcp-server` | `clawd-mcp` |
| `wallet` | `pay` | `clawd-wallet`, `clawd-router` | `clawd-wallet` |
| `perps` | `trade` | `clawd-perps-agent`, `v3` | `clawd-perps-agent` |
| `memory` | — | `membrain` | `membrain` |

- **Router statuses:** `delivered` | `unreachable` | `unsupported`.
- **Keyless see-each-other check:** `npm run stack:doctor` (MCP 8 servers, plugin, operator, catalog, cloud map, connectors).
- **MCP registry (Cloud `.mcp.json`):** DFlow, Helius, Jupiter, Birdeye, zkcompression, clawd-mcp, solana-mcp, pump-mcp — **not** Blockscout.

60-second start on GitHub README matches the local checkout (`./claw cloud`, `./clawd --plugin-dir ./clawd-plugin`, `npx clawd-mcp@latest`, `stack:doctor`). Local-only drift: `membrane.db*` and package `node_modules`/`dist`.

## Path classes (OBJECTIVE)

Every named Cloud path is one of: MANIFEST destination, operator/harness, ops/docs/license, generated/runtime junk, or do-not-copy. Full table: analysis scratch `cloud-inventory.md`. Summary:

- **Operator/harness:** `claw`, `clawd`, `AGENTS.md`, `CLAWD.md`, `CLAUDE.md`, `MANIFEST.json`, `package.json`, `.mcp.json`.
- **Do-not-copy:** `node_modules/`, `dist/`, `membrane.db*`, `package-lock.json` as a go-bot product surface, `.env` / `.env.local`, Cloud `zk-primitives/` copy.
- **MANIFEST dests** are the 32 registered packages (including `v3`, `clawd-code`, `membrain`, `zk-primitives`, `constitution`, `docs`, `convex`, `outputs`, …).

## go-bot crosswalk

Full rows: scratch `gobot-crosswalk.md`.

| Cloud | go-bot today | Class |
|---|---|---|
| dest catalog (`clawd-core`, `./claw cloud`) | `pkg/catalog` (`CLAWDBOT_SKILLS_DIR`, `CLAWDBOT_AGENTS_DIR`, `CLAWDBOT_ZK_PRIMITIVES_DIR`) | attach (discovery later) |
| `zk-primitives` | `./zk-primitives`, `pkg/zkomni`, doctor `zk.surface` | **conflict — go-bot owns** |
| `clawd-code` | `pkg/clawdcode` `DefaultDir` = `~/clawd-code` | keep home dir; optional later override |
| `.mcp.json` Helius/DFlow/Jupiter/Birdeye/`clawd-mcp` | `pkg/mcp` Blockscout | coexist; do not replace |
| `membrain` | `pkg/memory` ClawVault + Supabase | Cloud-only sidecar |
| `clawd-perps-agent` / `v3` paper | `pkg/vulcan` / `pkg/phoenix` paper | coexist |
| `clawd-wallet` | `pkg/wallet` | coexist (Privy vs local keypairs) |
| `constitution` | `CONSTITUTION.md`, `six-laws.md`, `three-laws.md`, `pkg/laws` | already-present; no merge |
| `clawd-skills` / `.agents` | `./skills` RH/EVM pack | coexist |

Shipped doctor check IDs that already cover overlapping surfaces: `zk.surface`, `connectors.blockscout_mcp`, `perps.vulcan`. There is no `CLAWD_CLOUD_ROOT` reader yet.

## What attach would do (out of scope here)

1. Document / later honor `CLAWD_CLOUD_ROOT` pointing at a Cloud checkout.
2. List dests + caps from `MANIFEST.json` + `cloud-map.mjs` (or invoke `./claw cloud`).
3. Doctor: warn if Cloud root is set but `stack:doctor` / operator missing — without requiring RPC.
4. Never set `CLAWDBOT_ZK_PRIMITIVES_DIR` to Cloud’s tree.

Tests in `pkg/catalog`, `pkg/clawdcode`, `pkg/doctor`, and `pkg/zkomni` lock the **current** surfaces so a future attach cannot silently retarget ZK ownership, Clawd Code’s home dir, or Blockscout MCP.
