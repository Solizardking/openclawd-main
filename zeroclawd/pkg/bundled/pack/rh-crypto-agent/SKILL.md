---
name: rh-crypto-agent
description: >
  Robinhood Crypto Agent open skill pack for Robinhood Chain / EVM trading and launch
  agents. Covers bonded launch, Launchpad V3, Uniswap swaps/LP, DCA, copy-trade,
  payments, viem, and Cheshire agent registry skills. Use when pointing clawdbot at
  the RH pack, installing the suite, or building Robinhood Chain crypto agents.
---

# Robinhood Crypto Agent Open Stack

Open-source skill **pack** for building Robinhood Chain / EVM trading and launch agents with Zero Clawd (`go-bot` / `clawdbot`).

This hub entry is the **pack index**. Nested skill bodies for the full open stack live in the Cheshire agents monorepo at `skills/rh-crypto-agent/` (or install individual first-class suite skills from this hub).

## Suite membership

Listed in `suite-index.json` as pack root (`pack-index.json` + nested skills). First-class suite skills also ship as top-level hub entries:

- `cheshire-agent-identity-registry`
- `cheshire-agent-registries`
- `cheshire-agent-reputation-registry`
- `cheshire-agent-validation-registry`
- `cheshire-zk-omni`
- `rh-bonded-launch`
- `rh-launchpad-v3`
- plus forge / omni / messaging: `robinhood-agent-forge`, `cheshire-omni-mint`, `zk-omni-messaging`

## Point clawdbot at the pack

```bash
# Full suite (registries + forge + launch + pack)
export CLAWDBOT_SKILLS_DIR="/path/to/agents/skills"

# Or the vendored RH open pack only
export CLAWDBOT_SKILLS_DIR="/path/to/agents/skills/rh-crypto-agent"
```

## Install first-class skills from this hub

```bash
npx github:Solizardking/skills install \
  cheshire-agent-registries \
  cheshire-agent-identity-registry \
  robinhood-agent-forge \
  cheshire-omni-mint \
  cheshire-zk-omni \
  rh-bonded-launch \
  rh-launchpad-v3 \
  zk-omni-messaging \
  rh-crypto-agent
```

## Pack metadata

- `pack-index.json` — skill id list and counts
- `catalog.json` — flat catalog entries for the open stack
- `README.md` — operator-facing pack docs
- Root indexes: `suite-index.json`, `skillhub-index.json`

## Product surfaces

| Surface | URL |
|---------|-----|
| Agent hub | https://cheshireterminal.ai/agents |
| Forge | https://cheshireterminal.ai/agents/forge |
| FunPump | https://funpump.ai |
