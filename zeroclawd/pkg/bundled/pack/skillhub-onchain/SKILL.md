---
name: skillhub-onchain
description: >
  Publish agent skills on-chain via Skill Hub (skills.x402.wtf): upload SKILL.md,
  run the security scanner, pay a Solana fee, and anchor package hashes on Arweave
  and Solana. Use when shipping skills to the public catalog, reading the public
  submission ledger, or connecting Cheshire Terminal to the Skill Hub API.
license: MIT
version: "1.0.0"
compatibility: Requires network access to skills.x402.wtf and a Solana wallet for publish fees
metadata:
  author: cheshire-terminal
  version: "1.0.0"
  homepage: https://skills.x402.wtf/publish
---

# Skill Hub on-chain publish

## When to use

- Publishing a new agent skill to the public hub
- Verifying a skill's bundle hash / Merkle leaf
- Linking Cheshire Terminal UI to live catalog data
- Reading the **redacted** public submission ledger (safe for GitHub)

## Origins

| Origin | Use |
|--------|-----|
| `https://skills.x402.wtf` | **Primary** Skill Hub (catalog, publish, ledger) |
| `https://skills.onchainai.fund` | Legacy alias (same deploy) |
| `https://cheshireterminal.ai/skills` | Cheshire multi-source skills UI |
| `https://cheshireterminal.ai/skills-store` | Curated store (this package) |

## Pipeline

```
upload SKILL.md → scanner (CRITICAL blocks) → Solana fee + memo → Irys/Arweave package → Solana memo anchor
```

1. Open https://skills.x402.wtf/publish (or run `npm run relay:upload` in Solizardking/skills)
2. Drop `SKILL.md` (+ optional helpers)
3. Scan — fix CRITICAL findings
4. Connect Phantom / Solflare and pay the publish fee
5. Relay confirms the payment signature on RPC, then packages + anchors

## Public APIs (no secrets)

```bash
# Full catalog
curl -sS https://skills.x402.wtf/api/skills.json | head

# Redacted community submissions (GitHub-safe ledger)
curl -sS https://skills.x402.wtf/api/submissions.json

# On-chain summary + catalog anchor receipt pointers
curl -sS https://skills.x402.wtf/api/onchain.json

# Per-skill source
curl -sS https://skills.x402.wtf/api/skills/solana-common-errors/SKILL.md | head
```

## Cheshire wiring

Cheshire proxies the live hub:

```bash
curl -sS https://cheshireterminal.ai/api/skills | jq '.sources, .count'
# SKILLS_LIVE_BASE_URL defaults to https://skills.x402.wtf
```

Env (Cheshire deploy):

| Variable | Default | Role |
|----------|---------|------|
| `SKILLS_LIVE_BASE_URL` | `https://skills.x402.wtf` | Upstream Skill Hub |

## Security

- Private job stores live under `onchain/submissions/` (**gitignored**)
- Public ledger (`onchain/public-ledger.json` → `/api/submissions.json`) is **redacted**:
  - no private keys / keypairs / mnemonics
  - no blocked skill file bodies
  - only hashes, risk, wallets, payment + explorer links
- Never commit `SOLANA_KEYPAIR`, `.env`, or merchant private keys

## Install this skill

```bash
npx skills add Solizardking/cheshire-terminal --path skills-store/skillhub-onchain
```

## Related skills

- `solana-common-errors` — Anchor/GLIBC/build-sbf troubleshooting
- `cheshire-api` — Cheshire REST + MCP discovery
