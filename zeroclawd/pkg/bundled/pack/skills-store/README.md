# Cheshire Skills Store

Curated [Agent Skills](https://agentskills.io) packages plus the complete repository-local `skills/` collection for Cheshire Terminal, Solana agents, PostHog, Google Agent Registry, Skill Hub, and **Stripe** (official Claude plugin).

Spec: each skill is a directory with `SKILL.md` (YAML frontmatter + Markdown body) plus optional `references/` and `scripts/`. See https://agentskills.io/llms.txt

## Skills

| Skill | Version | Priority | What it does |
|-------|---------|----------|--------------|
| [`solana-common-errors`](./solana-common-errors/) | 1.0.0 | critical | GLIBC, Anchor, build-sbf, LiteSVM, edition2024 |
| [`skillhub-onchain`](./skillhub-onchain/) | 1.0.0 | high | Publish skills via skills.x402.wtf + on-chain anchor |
| [`cheshire-api`](./cheshire-api/) | 1.2.0 | — | REST, MCP (12 tools), discovery, arena/boxes |
| [`posthog-cheshire`](./posthog-cheshire/) | 1.1.0 | — | PostHog US project 473072, privacy, events |
| [`google-agent-registry`](./google-agent-registry/) | 1.1.0 | — | A2A/MCP registry cards, 10 KB limits, Apigee |
| [`stripe`](./stripe/) | 1.0.0 | high | Official Claude plugin install + Checkout/PaymentIntents/MCP |

Machine index: [`catalog.json`](./catalog.json)

Complete imported index: [`imported-skills.json`](./imported-skills.json). It is
generated from `../skills` without duplicating the nearly 1 GB source tree.

Static security scanner and browser report: [`scanner/`](./scanner/README.md)

## Install (agent clients)

```bash
# Whole store (GitHub)
npx skills add Solizardking/cheshire-terminal --path skills-store

# Whole store (local checkout)
npx skills add ./skills-store

# Single skill
npx skills add ./skills-store/cheshire-api
npx skills add ./skills-store/solana-common-errors
npx skills add ./skills-store/skillhub-onchain
npx skills add ./skills-store/posthog-cheshire
npx skills add ./skills-store/google-agent-registry
npx skills add ./skills-store/stripe
```

## Scan

```bash
pnpm run scan:skills-store
pnpm run check:skills-store-scan
```

The dependency-free scanner reads this store's catalog, scans every packaged
`SKILL.md`, reference, script, asset, and agent file, and writes reports under
`skills-store/scanner/results/` plus browser data under
`skills-store/scanner/public/`.

### Claude Code — official Stripe plugin

In Claude Code (marketplace `claude-plugins-official`):

```text
/plugin install stripe@claude-plugins-official
```

```bash
claude plugin install stripe@claude-plugins-official
```

That plugin wires MCP at `https://mcp.stripe.com` and commands `/test-cards`, `/explain-error`.  
The store package `skills-store/stripe` teaches agents when/how to use it; it does not replace the plugin itself.

## Live API & UI

| Endpoint / UI | Description |
|---------------|-------------|
| `GET /api/skills-store` | Store index (name, description, install, validation) |
| `GET /api/skills-store/:name` | One skill + full SKILL.md |
| `GET /api/skills-store/:name/SKILL.md` | Raw markdown |
| `GET /api/skills` | Full multi-source catalog (includes this store) |
| https://cheshireterminal.ai/skills-store | Store UI |
| https://cheshireterminal.ai/skills | Broader skills catalog |
| https://skills.x402.wtf | Public Skill Hub |

```bash
curl -sS https://cheshireterminal.ai/api/skills-store | jq '.count, .version'
curl -sS https://cheshireterminal.ai/api/skills-store/cheshire-api | jq '.name, .validation, .references'
```

> Production returns public JSON after deploy of this branch. Local: `pnpm dev` then hit `/api/skills-store`.

## Layout

```
skills-store/
  README.md
  catalog.json
  scripts/
    validate-store.mjs
  scanner/
    bin/scan-skills.mjs
    public/index.html
    results/
  solana-common-errors/
    SKILL.md
    references/common-errors.md
  skillhub-onchain/
    SKILL.md
  cheshire-api/
    SKILL.md
    references/{endpoints,mcp-tools}.md
    scripts/smoke-discovery.sh
  posthog-cheshire/
    SKILL.md
    references/{events,privacy}.md
    scripts/check-posthog-env.sh
  google-agent-registry/
    SKILL.md
    references/{registry-files,apigee}.md
    scripts/check-registry.sh
  stripe/
    SKILL.md
    references/{payments,plugin-commands}.md
    scripts/check-stripe-skill.sh
```

## Validate

```bash
pnpm run validate:skills-store
pnpm run smoke:skills-store
pnpm run index:skills-store

# Individual
bash skills-store/cheshire-api/scripts/smoke-discovery.sh
bash skills-store/posthog-cheshire/scripts/check-posthog-env.sh
bash skills-store/google-agent-registry/scripts/check-registry.sh
bash skills-store/stripe/scripts/check-stripe-skill.sh
```

## Authoring rules

1. **Directory name == frontmatter `name`** (kebab-case, `^[a-z0-9]+(?:-[a-z0-9]+)*$`)
2. **Description** 1–1024 chars — include *what* + *when to use* (triggers)
3. Keep `SKILL.md` lean; put long tables in `references/`
4. Optional `scripts/` must be safe to run (no secrets printed)
5. Do **not** put per-skill `README.md` files — only this store-level README
6. Bump skill `version` + `catalog.json` entry together
7. Critical Solana tooling fixes go in `solana-common-errors` first
8. Run `pnpm run index:skills-store` after adding, moving, or removing anything under `skills/`

## Related repo paths

| Path | Role |
|------|------|
| `server/routes/skills-store.ts` | HTTP store API (public) |
| `server/mcp/tools.ts` | Live MCP tools |
| `registry/google/` | Google Agent Registry sources |
| `client/src/lib/posthog.ts` | Browser analytics |
| `client/src/pages/SkillsStorePage.tsx` | Store UI |
| `API.md` / `GOOGLE.md` | Canonical product docs |
