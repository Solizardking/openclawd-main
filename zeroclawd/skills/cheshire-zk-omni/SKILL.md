---
name: cheshire-zk-omni
description: >
  Zero-knowledge omnichain messaging (msgType 4) between Robinhood Chain and
  Solana via CheshireZkOmniMessenger — LayerZero V2 peers, Ed25519 proof of
  knowledge, nullifier anti-replay, zk-omni-relayer. Use for sendZkOmni,
  zero zkomni plan/oneshot, nullifiers. Source: robinhood-agents contracts/zk-omni
  + programs/zk_omni + Clawd Bot pkg/zkomni.
---

# Cheshire ZK Omnichain (Clawd Bot)

Cross-chain messenger **Robinhood Chain (EID 30416) ↔ Solana (EID 30168)** with:

- **Ed25519 PoK** of a secret (secret never on-chain)
- **Nullifier** bound to `proofPubkey` + payload binding
- LayerZero peer auth + Solana `receive_zk_omni` (nullifier PDA + Ed25519 precompile)

## Clawd Bot one-shot (user-friendly)

```bash
# Native Go plan (no Node required)
clawdbot zero zkomni plan --action attest --memo demo
clawdbot zero zkomni oneshot --action publish_attestation --memo oneshot

# Natural language (routes via pkg/zero intent router, no model call)
clawdbot zero ask "zk-omni message attest demo"
clawdbot zero ask "send cross-chain message robinhood to solana"
```

Package: `pkg/zkomni` — same crypto as `cheshire-terminal/robinhood-agents/src/zkOmni/proof.js`.

## Node relayer / full surface

```bash
cd cheshire-terminal/robinhood-agents
npm run test:zk-omni
npm start --prefix . -- zk-omni-oneshot --action publish_attestation   # via cli.js
# or
npx robinhood-agents zk-omni-plan --action attest --memo demo
npx robinhood-agents zk-omni-oneshot --action publish_attestation
npm run zk-omni:relayer -- --port 8787
```

## Source map

| Surface | Path |
|---------|------|
| RH messenger | `cheshire-terminal/robinhood-agents/contracts/zk-omni/CheshireZkOmniMessenger.sol` |
| Solana receiver | `robinhood-agents/programs/zk_omni` (`Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ`) |
| Codec / relayer | `robinhood-agents/src/zkOmni/` |
| Clawd Bot | `go-bot/pkg/zkomni` + `clawdbot zero zkomni` |
| Docs | `robinhood-agents/docs/ZK_OMNI.md` |

## Constants

| Name | Value |
|------|--------|
| `MSG_ZK_OMNI` | `4` |
| `SOLANA_EID` | `30168` |
| `ROBINHOOD_EID` | `30416` |
| Solana program | `Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ` |

## Payload (msgType 4)

```text
uint16  msgType, bytes32 agentId, bytes32 controller, bytes32 nullifier,
bytes32 payloadCommitment, bytes32 modelHash, bytes32 proofPubkey,
uint64  expiresAt, string action, string memo, bytes proof  // 64-byte Ed25519
```

## Operator notes

1. Fresh nullifier per intent — never reuse.
2. Live deliver needs `RH_RPC_URL` + messenger + key, or `ZK_OMNI_SIMULATE=1`.
3. Solana receive: Ed25519Program ix **then** `receive_zk_omni` in the same tx.
4. Product hosts: FunPump · cheshireterminal.ai · install surfaces on x402.wtf.

## Related

- `cheshire-omni-mint` — dual-rail identity + optional zk-omni link
- `cheshire-agent-registries` — ERC-8004 suite
- `zk-omni-messaging` skill in robinhood-agents
