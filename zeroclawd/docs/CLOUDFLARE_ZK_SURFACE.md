# Cloudflare + ZK Runtime Surface

This document ties together the edge installer, the local ZK primitive source,
and the Go runtime catalog.

## Local Paths

| Path | Role |
|---|---|
| `cloudflare/install-worker.js` | Cloudflare Worker for install wrappers, raw installer proxying, and metadata |
| `cloudflare/install-worker.test.mjs` | Local route and metadata test |
| `cloudflare/README.md` | Worker deployment and smoke-test guide |
| `wrangler.toml` | Worker config, vars, and routes |
| `zk-primitives/MANIFEST.json` | Machine-readable ZK subsystem index |
| `zk-primitives/docs/EDGE_DISTRIBUTION.md` | ZK-specific edge metadata contract |
| `pkg/catalog/catalog.go` | Go runtime loader for local skill, agent, and ZK catalog surfaces |
| `cmd/clawdbot/main.go` | `clawdbot catalog zk` display command |

## Repository Coverage Map

| Path | Included Surface |
|---|---|
| `.gitattributes` | Text normalization and generated artifact classification |
| `AGENTS.md` | Agent catalog, public surfaces, local catalog roots |
| `CLAWD.md` | Spawn context, deployment targets, ZK/Cloudflare public surfaces |
| `backend` | Legacy/backend marker retained by the runtime tree |
| `cmd/` | CLI entrypoints, including `clawdbot catalog zk` |
| `dist/` | Generated output boundary; treated as generated when present |
| `docs/` | Release, TEE, Zero, PiedPiper, and Cloudflare/ZK integration docs |
| `ooda/` | TypeScript OODA harness and journal loop |
| `pkg/` | Go runtime packages, catalog loader, doctor checks, trading/runtime logic |
| `scripts/` | Install/bootstrap support services |
| `web/` | Go-backed web console |
| `ui/` | Vite/React UI and ClawdBrowser assets |
| `zk-primitives/agent` | ZK agent wrapper and skill surface |
| `zk-primitives/client` | TypeScript SDK |
| `zk-primitives/configs` | Light tree and Cloudflare metadata examples |
| `zk-primitives/docs` | Architecture, integration, and edge-distribution docs |
| `zk-primitives/programs` | Anchor program surface |
| `zk-primitives/tests` | Off-chain, edge metadata, and on-chain test notes |

## Public Routes

| Route | Output |
|---|---|
| `https://install.onchainai.fund/` | Complete install wrapper |
| `https://install.onchainai.fund/install.sh` | Raw installer proxy |
| `https://install.onchainai.fund/.well-known/clawdbot-install.json` | Combined installer metadata |
| `https://install.onchainai.fund/.well-known/clawdbot-zk.json` | ZK primitive metadata |
| `https://zk.x402.wtf/clawdbot` | Complete install wrapper under `/clawdbot` |
| `https://zk.x402.wtf/clawdbot/.well-known/clawdbot-zk.json` | ZK primitive metadata under `/clawdbot` |

## Verification

```bash
node --test cloudflare/install-worker.test.mjs
go test ./pkg/catalog
clawdbot catalog zk
curl -fsSL https://install.onchainai.fund/.well-known/clawdbot-zk.json
```

## Trust Boundary

Cloudflare metadata is observer-only discovery data. The local ZK packages can
compute nullifiers, verify proof shape, and build dry-run Solana instructions.
Live signing and transaction submission remain delegated actions controlled by
operator policy and signer infrastructure.
