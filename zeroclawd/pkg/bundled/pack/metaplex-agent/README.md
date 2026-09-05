# metaplex-agent — Premiere Skill Hub skill

**Premiere** Metaplex Agent playbook for Skill Hub: one installable skill that packages
**every Metaplex agent operation** agents and operators need on Solana.

| | |
|---|---|
| **Slug** | `metaplex-agent` |
| **Category** | Solana / Blockchain |
| **Status** | Premiere (hub lead offering) |
| **Requires** | Node.js; funded wallet ≥ ~0.2 SOL; dedicated RPC on mainnet |
| **Upstream docs** | [Metaplex Agents](https://metaplex.com/docs/agents) |

## Install

```bash
# Premiere single skill
npx github:Solizardking/skills install metaplex-agent

# Or with the full Metaplex program skill (NFTs, Bubblegum, Candy Machine, …)
npx github:Solizardking/skills install metaplex-agent metaplex/skills/metaplex
```

Point at your agent skill root:

```bash
npx github:Solizardking/skills install metaplex-agent --target ~/.codex/skills
npx github:Solizardking/skills install metaplex-agent --claude
```

## What this skill is for

Use **metaplex-agent** when you (or your coding agent) need to:

1. **Onboard** — install `mplx`, configure RPC, create/fund wallet  
2. **Register identity** — mint Core asset + Agent Registry (EIP-8004 metadata)  
3. **Activate wallet** — Asset Signer PDA (no private key; spends via Execute)  
4. **Delegate** — executive profile + per-asset execution delegation / revoke  
5. **Commerce** — advertise `services[]`, `x402Support`, discover counterparties, settle stablecoins  
6. **Finance / token** — Genesis LaunchPool or Bonding Curve agent token; permanent `setAgentToken`  

It is written as a **command-by-command walkthrough** an autonomous agent can follow.

## What’s inside

```
metaplex-agent/
├── SKILL.md                 # Agent playbook (load this)
├── README.md                # This file
└── references/
    ├── cli-initial-setup.md # RPC, keypair, airdrop
    ├── cli.md               # CLI agent guidelines
    ├── cli-agent.md         # register / fetch / executive / set-agent-token
    ├── cli-genesis.md       # LaunchPool + bonding-curve TGEs
    └── sdk-agent.md         # Umi mintAndSubmitAgent, identity, delegate
```

## Quick start (devnet)

```bash
npm i -g @metaplex-foundation/cli
mplx config rpcs add devnet https://api.devnet.solana.com
mplx config rpcs set devnet
mplx config wallets new agent-main --hidden
mplx toolbox sol airdrop --amount 2

mplx agents register --name "My Agent" \
  --description "Premiere hub demo agent" \
  --image "./avatar.png" \
  --json
# Save Core asset address → mplx agents fetch <ASSET>
```

## Commerce vs finance

| Layer | Question it answers |
|-------|---------------------|
| **Agent finance** | How is the agent capitalized and governed (token)? |
| **Agent commerce** | How does the agent earn, pay, and discover counterparties? |

Finance bootstraps the agent; commerce is how it sustains itself. Both share the same
EIP-8004 registration document and Asset Signer wallet.

## Safety

- Mainnet registration needs a **dedicated RPC** — not the public devnet endpoint.  
- **`--agentSetToken` is irreversible.** Confirm before linking a Genesis mint.  
- Owner can **revoke** executive delegation at any time.  
- Never put private keys or seed phrases into logs, memory files, or skill notes.

## Related hub skills

| Skill | Use when |
|-------|----------|
| [`metaplex-agent`](./SKILL.md) | **This skill** — agent lifecycle (premiere) |
| [`metaplex/skills/metaplex`](../metaplex/skills/metaplex/SKILL.md) | Full Metaplex programs (Core, TM, Bubblegum, Candy, Genesis details) |
| [`clawd-agent-launchpad`](../clawd-agent-launchpad/SKILL.md) | Clawd / Cheshire Terminal agent launchpad surfaces |
| [`solana-clawd-agentic-commerce`](../solana-clawd-agentic-commerce/SKILL.md) | CLAWD agentic commerce + Pay CLI |

## Docs map (upstream)

- [Agent Onboarding](https://metaplex.com/docs/agents) — canonical start  
- Agent commerce — services, x402Support, A2A discovery, PDA settlement  
- Agent finance / Create an Agent Token — Genesis link + DAS `agent_token`  
- What is an agent? — Core asset + identity + execute model  

## License

Skill packaging under the hub license; Metaplex CLI/SDK remain Apache-2.0 /
their respective Metaplex licenses. Content synthesized from Metaplex agent
documentation (2026) for agent consumption.
