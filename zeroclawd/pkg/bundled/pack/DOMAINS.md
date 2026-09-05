# Domains

## Primary product family: `*.x402agent.io`

| Host | Role |
|------|------|
| **`x402agent.io`** | X402 Agent product surface (API + dashboard) |
| **`skills.x402agent.io`** | Skill catalog site · API · static Skill Hub build |
| **`hub.x402agent.io`** | Skill Hub portal (discovery, publish, scanner entry) |

### DNS / deploy (skills catalog)

| Record | Value |
|--------|--------|
| Type | `CNAME` (or A/ALIAS per host) |
| Name | `skills` |
| Target | Vercel/Render project serving `skillhub/public` |

### DNS / deploy (hub portal)

| Record | Value |
|--------|--------|
| Type | `CNAME` |
| Name | `hub` |
| Target | Same Skill Hub deploy **or** agent app (`x402-agent`) with `/skillhub` + `/skills-hub` |

After DNS:

1. Add domains in Vercel → Project → Settings → Domains → `skills.x402agent.io` and `hub.x402agent.io`
2. Optional 308 aliases: `skills.x402.wtf` → `skills.x402agent.io`
3. Redeploy: `npm run build:catalog` writes `public/CNAME` as `skills.x402agent.io`

## Aliases (legacy)

| Host | Role |
|------|------|
| `skills.x402agent.io` | **Primary catalog** |
| `hub.x402agent.io` | **Primary hub portal** |
| `skills.x402.wtf` | Legacy alias (same static output) |
| `skills.onchainai.fund` | Older legacy alias |
| `cheshireterminal.ai/skills` | Cheshire UI proxying hub API |

## Env

```bash
# Agent product
export PRODUCT_URL=https://x402agent.io
export SKILLS_URL=https://skills.x402agent.io
export HUB_URL=https://hub.x402agent.io

# Skill Hub build (catalog site)
export SKILLHUB_SITE_URL=https://skills.x402agent.io

# Cheshire / live base (optional)
export SKILLS_LIVE_BASE_URL=https://skills.x402agent.io
```

## Verify

```bash
curl -sI https://skills.x402agent.io | head
curl -sS https://skills.x402agent.io/api/skills.json | head -c 200
curl -sS https://skills.x402agent.io/api/submissions.json | head -c 200
curl -sS https://hub.x402agent.io | head
# Local agent bridge
curl -sS http://localhost:3000/skills-hub | head -c 400
curl -sS http://localhost:3000/health | head -c 400
```
