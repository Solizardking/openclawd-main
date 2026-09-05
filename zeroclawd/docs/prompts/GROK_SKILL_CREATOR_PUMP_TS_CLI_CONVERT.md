# grok-skill-creator prompt — `pump-ts-cli-convert`

Paste this entire file into a future agent session that has loaded `grok-skill-creator`. That agent must **create** the conversion skill. It must **not** rewrite existing Pump.fun skills.

---

Follow `grok-skill-creator` (`~/.agents/skills/grok-skill-creator/SKILL.md`) and `skill-design-principles`. Then persist via `push-skill-to-github`.

## This maker run

Create **one** Grok-native skill:

| Field | Value |
|---|---|
| Name | `pump-ts-cli-convert` |
| Path | `~/.agents/skills/pump-ts-cli-convert/SKILL.md` |
| Job | Convert TypeScript that already lives in Pump.fun files/skills into the current Pump.fun runnable-script pattern, then optionally execute the converted scripts |

Do **not** edit `pumpfun`, `pump-*`, `pumpfun-*`, `create-coin`, or `coin-fees` as the deliverable of this run. Those trees are **inputs** the generated skill will later convert. The only new tree this run writes is `pump-ts-cli-convert`.

## What the generated skill does

When a later agent loads `pump-ts-cli-convert`, it:

1. Finds TypeScript currently living in Pump.fun skill files (inline ` ```typescript ` / ` ```ts ` blocks, non-CLI `.ts` fragments, library-style snippets in SKILL.md).
2. Converts each unit of work into **two** runnable Node/TypeScript scripts next to the source skill (or into an explicit target dir the user names):
   - `scripts/example.ts` — the entire job: inspect → execute → log → compact JSON summary
   - `scripts/check-env.ts` — startup/env validation
3. **Convert** = write the scripts, do not send transactions.
4. **Convert and execute** = write the scripts, run `check-env.ts`, then run `example.ts`. Read-only / dry-run by default. Live signing or `sendTransaction` requires an explicit user confirmation in that later session.

Trigger phrases for the generated skill's `description` (what + when + differentiator; no how-to in frontmatter):

- convert pump typescript / convert this pump snippet to scripts
- convert and execute pump.fun TypeScript
- wrap this pump SDK example as `example.ts` + `check-env.ts`
- pump skill CLI convert / pump ts to node scripts

Differentiator: this skill **converts existing Pump.fun TypeScript into the two-script CLI pattern**. It does not replace `pumpfun` routing, and it does not author new Pump protocol logic from scratch.

## Canonical script shape (mandatory — do not get this wrong)

Every generated `scripts/example.ts` and `scripts/check-env.ts` MUST use a CLI-wrapped `async function main(): Promise<number>` that `process.exit()`s.

**Required shape:**

```typescript
#!/usr/bin/env npx tsx

async function main(): Promise<number> {
  // inspect → execute → log → compact JSON summary (example.ts)
  // or env/startup validation (check-env.ts)
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return 0;
}

process.exit(await main());
```

Rules:

- `main` is typed `Promise<number>`.
- Success returns `0`. Recoverable failure returns `1` (or another documented non-zero code).
- The process ends with `process.exit(await main())` at top level. That is the CLI wrap.
- Catch errors **inside** `main`, write the message to **stderr**, return a non-zero code. Do not throw out of `main` as the exit strategy.
- stdout is **one compact JSON object** (no pretty-print by default; `JSON.stringify(obj)` with no extra indent). Human logs go to stderr if needed.
- Shebang: `#!/usr/bin/env npx tsx`. Run with `npx tsx scripts/example.ts` / `npx tsx scripts/check-env.ts`.

### Forbidden wrappers (the previous mistake)

Do **not** emit any of these:

```typescript
// IIFE — forbidden
(async () => {
  await main();
})();

void (async function main() {
  /* ... */
})();

(async function main() {
  /* ... */
})().catch(/* ... */);

// untyped main + detached catch — forbidden
async function main() {
  /* ... */
}
main().catch((e) => {
  process.stderr.write(`${e}\n`);
  process.exit(1);
});

void main();
```

No extra IIFE. No `main().catch(...)` as the process wrapper. Exit codes come from `main`'s `number` return, then `process.exit`.

## Script 1 — `scripts/example.ts`

Does the **entire** converted job in one process:

1. **Inspect** — parse CLI flags (`node:util` `parseArgs`), load env already validated by `check-env` (or re-check and fail closed), fetch read-only state (RPC, HTTP, SDK `fetch*`).
2. **Execute** — run the original TypeScript's work. Default is inspect / quote / build-unsigned-tx. Do not sign or broadcast unless the later user said "execute" **and** confirmed live send.
3. **Log** — progress and errors on stderr. Never log private keys, secret key bytes, or 1Password item contents.
4. **Compact JSON summary** — exactly one JSON object on stdout. Include `ok`, operation name, mint/user/public identifiers, and result fields. For tx builders: `transaction` as base64, never a secret key.

`--help` / `-h` prints usage on stderr and returns `0`.

## Script 2 — `scripts/check-env.ts`

Startup/env validation only. Same CLI wrap as above.

Primary path: `process.env`.

Required vars depend on the converted snippet. Typical Pump set:

- `SOLANA_RPC_URL` (or `NEXT_PUBLIC_SOLANA_RPC_URL`) for any RPC/tx work
- never require a user private key for build-only scripts

Behavior:

1. Report which required vars are present vs missing. **Never print secret values** — only names and `set` / `missing`.
2. If all required vars are set, print compact JSON `{ "ok": true, "vars": { "SOLANA_RPC_URL": "set", ... } }` and return `0`.
3. If something is missing, **1Password CLI (`op`) is the fallback**, not the primary pattern:
   - If `op` is available and the user/session can sign in, inject missing vars via `op run` / `op inject` (follow the `1password` skill: `op` only inside tmux).
   - Re-check env after inject.
   - If still missing, print compact JSON `{ "ok": false, "missing": ["..."] }` plus how to export or `op` inject, return `1`.
4. Do not write secrets to `.env` files unless the user explicitly asks.

## Conversion mapping

| Source | Target |
|---|---|
| Inline TypeScript in Pump SKILL.md fenced blocks | `scripts/example.ts` implementing that snippet as a CLI |
| SDK setup + one operation (create, buy, sell, quote, collect fees, …) | one `example.ts` per operation; share helpers under `scripts/lib/` only if the source already had shared helpers |
| Env reads / RPC URL / keypair path checks | `scripts/check-env.ts` |
| `TransactionInstruction[]` builders | `example.ts` inspects state, builds ixs, optionally assembles an unsigned tx, prints JSON |
| HTTP-only reads (`coins-v2`, quotes) | `example.ts` with no RPC requirement unless the snippet uses one |

Preserve the source's SDK imports. Align package names with the **target repo's** `package.json` (`@pump-fun/pump-sdk` vs `@nirholas/pump-sdk`). Do not invent a third package name.

Integer money: `BN` / `bigint`. No JS `number` for lamports, reserves, fees, or token amounts.

## Sources the conversion skill should search

When invoked later, search these trees (whichever exist) for TypeScript to convert. Do not "fix" them during the maker run.

- `~/.agents/skills/pumpfun`, `pump-*`, `pumpfun-*`, `create-coin`, `coin-fees`
- `./.agents/skills/` copies of the same names in go-bot
- `~/skills/skills` if the bundled pack is not on the cwd walk
- Any path the user points at ("convert the TypeScript in this file")

Goldens for JSON-on-stdout and flag style: `~/.agents/skills/create-coin/scripts/*.mjs` (especially `printJson`, `parseArgs`, `--help`). Those files today use `async function main()` + `main().catch(...)`. The **conversion target is not that catch wrapper**. Copy their JSON/flag discipline; use the `Promise<number>` + `process.exit(await main())` wrap instead.

## Safety the generated skill must encode

- Never log, print, or return private keys or 1Password secrets.
- Default convert-and-execute is read-only / unsigned-tx. Live send needs explicit confirmation.
- Build scripts must not take an end-user secret key as a CLI flag.
- If the source snippet signs, the converted `example.ts` should build + print the unsigned/partial-signed tx and stop, unless the user confirmed live execute.
- `frontend-api-v3.pump.fun` is CORS-protected; server/script context only.
- Never trust `token_program` from HTTP `coins-v2`; resolve mint owner on-chain when the snippet touches a mint.

## Generated skill layout

```
pump-ts-cli-convert/
├── SKILL.md
└── references/
    └── SCRIPT_SHAPE.md    # the Promise<number> + process.exit wrap, plus forbidden IIFEs
```

Put the script-shape contract in `references/SCRIPT_SHAPE.md` and point at it from SKILL.md. Do not duplicate the forbidden-IIFE list in three places.

Optional: `scripts/scaffold-example.ts` only if it helps the converting agent emit the wrap identically every time. If present, that scaffold itself must use the same `main(): Promise<number>` + `process.exit(await main())` shape.

SKILL.md body: actionable steps, commands, env vars, failure modes. No design essay. Frontmatter `description` has no step-by-step how.

## Acceptance for this maker run

- [ ] `~/.agents/skills/pump-ts-cli-convert/SKILL.md` exists
- [ ] Description triggers on convert / convert-and-execute Pump TypeScript
- [ ] Body forbids IIFE and `main().catch` wrappers; requires `async function main(): Promise<number>` + `process.exit(await main())`
- [ ] Body requires `scripts/example.ts` (inspect → execute → log → compact JSON) and `scripts/check-env.ts` (env first, `op` fallback)
- [ ] Body does not rewrite existing Pump skills; it converts TypeScript found in them
- [ ] Pushed to `https://github.com/cheshireterminal/skills` per grok-skill-creator; report path, SHA, copy-back

If clone/push fails, stop and name the blocker. Do not claim the skill is persisted.
)
