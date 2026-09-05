# Stripe Claude plugin — install, MCP, commands

## Install (exact)

```text
/plugin install stripe@claude-plugins-official
```

```bash
claude plugin install stripe@claude-plugins-official
claude plugin list   # expect stripe@claude-plugins-official
```

Marketplace: **claude-plugins-official** (Anthropic).  
Upstream: https://github.com/stripe/ai/tree/main/providers/claude/plugin

## MCP

File `.mcp.json` in the official plugin:

```json
{
  "mcpServers": {
    "stripe": {
      "type": "http",
      "url": "https://mcp.stripe.com"
    }
  }
}
```

Host: **`https://mcp.stripe.com`**

## Commands

### `/test-cards [scenario]`

Quick reference for Stripe **test mode** card numbers:

- Successful payment (default)
- 3D Secure required
- Generic decline
- Specific declines (insufficient_funds, lost_card, …)

Any future expiry + any 3-digit CVC. Full list: https://docs.stripe.com/testing

### `/explain-error [code or message]`

Explains Stripe errors in plain English, common causes, retries, and sample handling code. Link out to relevant Stripe docs.

## Bundled skills (inside the plugin)

| Skill | Role |
|-------|------|
| `stripe-best-practices` | Checkout vs PaymentIntents, Connect, Billing, security |
| `upgrade-stripe` | API/SDK upgrades |
| `connect-recommend` | Connect / platform setup |
| `stripe-projects` / `stripe-directory` | Project navigation helpers |

## Local agent skill (this repo)

Separate from the Claude plugin — for any agentskills-compatible client:

```bash
npx skills add ./skills-store/stripe
```
