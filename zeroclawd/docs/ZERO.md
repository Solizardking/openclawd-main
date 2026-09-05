# Zero Engine — where "zero" is earned

Clawd's answer to [Gitlawb/zero](https://github.com/Gitlawb/zero): not a
fork, a redefinition. Upstream Zero is a 974-file, 68-package terminal agent
where "zero" is a brand. Here, `pkg/zero` is ~5 source files where "zero" is
two enforced invariants:

| Claim | Mechanism | Enforcement |
|---|---|---|
| **Zero recursion** | One flat FIFO task queue. `spawn_task` *enqueues* a child and parks the parent; a finishing child re-enqueues its parent. Depth is a counter on the task, never a position in the Go call stack. | `norecursion_test.go` builds the intra-package static call graph on every `go test` and fails on any direct or mutual recursion. Plant a recursive function and CI goes red. |
| **Zero knowledge** | Every run folds each event into a SHA-256 hash chain. The final head is a 32-byte commitment; the transcript stays local. | Commitment + nullifier are bit-compatible with `zk-primitives` (`@clawd/zk-client`) and feed straight into the on-chain `publish_attestation` instruction. |

## Why flat beats nested

Upstream Zero — like most coding agents — runs subagents as nested loops:
agent calls agent, each with its own stack frame, its own context, its own
failure surface. Recursion hides work: a depth-4 subagent's tool calls exist
only in its private loop.

The Zero engine has exactly one loop (`pkg/zero/loop.go`). Every LLM turn of
every task — root or spawned — passes through the same scheduler, the same
global turn budget, and the same transcript hash chain. Consequences:

- **Nothing can hide.** Every turn of every subtask is one record in one
  chain. The commitment covers the whole run, all depths.
- **Budgets are global.** `MaxTurns` bounds the entire run, not per-nesting-
  level; runaway spawn trees are structurally impossible (`MaxTasks`,
  `MaxDepth` are counters, not stack depth).
- **The stack can't blow.** Depth-1000 delegation would still use O(1) Go
  stack.

## Zero-knowledge run attestation

```
head_0 = SHA-256("clawd-zero/transcript/v1")
head_i = SHA-256(head_{i-1} ‖ canonicalJSON(record_i))
payloadCommitment = head_final
nullifier         = SHA-256(secret ‖ context ‖ nonce?)     // = @clawd/zk-client computeNullifier
modelHash         = SHA-256(ModelSetID(winnerModels))
```

The attestation JSON (`--attest`) carries exactly the four public inputs the
`clawd-zk` program verifies in `publish_attestation`:
`[attester, modelHash, payloadCommitment, nullifier]`. Generate the Groth16
proof with your circuit, then publish via the existing TS tooling:

```bash
ZERO_SECRET_HEX=<32-byte-hex> clawdbot zero run \
  --attest att.json --transcript run.jsonl "audit the OODA loop"

clawd-zk-agent attest $(jq -r .modelHash att.json) \
  $(jq -r .payloadCommitment att.json) proof.json --context "zero/run/v1"
```

What the chain learns: *this attester ran this model set over some transcript,
exactly once.* What it never learns: prompts, tool calls, outputs. The
nullifier's compressed PDA (15k lamports vs 890k for a regular PDA) gives
replay protection; anyone holding the JSONL can re-verify locally:

```bash
clawdbot zero verify run.jsonl
```

## ZK God Mode

`--god` routes every turn through `pkg/godmode`: the full model list races,
the scorer picks a winner, and **the winner's identity is folded into the
hash chain on that turn**. At the end, `modelHash` commits to the canonical
winner set (`ModelSetID` — deduped, sorted, order-independent). You can prove
on-chain that a run was produced by your championship model roster without
revealing a single token of the conversation.

```bash
clawdbot zero run --god --attest att.json "design the migration"
```

## Natural language

`zero ask` routes plain English with the same deterministic, rule-based
intent router as `@clawd/zk-agent` — no model call, no network, zero cost,
zero leakage of the utterance:

```bash
clawdbot zero ask "god mode: refactor the config loader"
clawdbot zero ask "verify run.jsonl"
clawdbot zero ask "derive a nullifier for 'zero/run/v1'"
```

| Verb pattern | Intent | Action |
|---|---|---|
| `god mode`, `race models`, `multi-model` | `god-mode` | run with `--god` |
| `attest`, `publish` | `attest` | attestation guidance |
| `verify`, `check`, `validate`, `replay` | `verify` | replay transcript chain |
| `nullifier`, `derive` | `nullifier` | derive nullifier |
| `inspect`, `config`, `status` | `inspect` | show engine config |
| anything else | `run` | flat-loop agent run |

## Surface

```
pkg/zero/
├── loop.go              flat scheduler (the only loop)
├── transcript.go        hash chain, nullifier, attestation, ModelSetID
├── intents.go           NL router (Zero-wide; zk-shark-agent twin lives in pkg/zkomni)
├── types.go             tasks, events, budgets, Result
├── norecursion_test.go  static call-graph recursion gate
└── zero_test.go         scheduling, chaining, zk-client compat vectors

cmd/clawdbot/zero.go     clawdbot zero {run|ask|verify|nullifier}
```

Environment: `ZERO_SECRET_HEX` — ≥16 bytes of hex secret material for
nullifier derivation (unset ⇒ ephemeral secret, non-re-derivable).
