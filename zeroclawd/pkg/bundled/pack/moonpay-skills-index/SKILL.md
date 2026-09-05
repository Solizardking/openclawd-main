---
name: moonpay-skills-index
description: Index of MoonPay and partner agent skills installed in the Cheshire/Solizardking skills hub. Use to discover moonpay-*, messari-*, PayBox, and related crypto infrastructure skills.
---

# MoonPay Skills Index

Installed from [moonpay/skills](https://github.com/moonpay/skills) into this hub (`skills/`). Official plugin map: [`moonpay/references/marketplace.json`](../moonpay/references/marketplace.json).

**What you can build:** see `moonpay` (overview, install, trade/research/safety/pay pipelines, skill combinations).  
**Live:** https://cheshireterminal.ai/skills/moonpay

## Entry points

| Skill | Role |
|-------|------|
| `moonpay` | Pack entry, “what you can build”, Cheshire `mcp-server` wiring |
| `moonpay-skills-index` | This index |
| `paybox` | PayBox MCP + Cheshire proxy tools |
| `moonpay-auth` | CLI install, login, wallets |
| `moonpay-mcp` | `mp mcp` setup |

## Core MoonPay

- `moonpay-auth` — login, verify, local wallets
- `moonpay-check-wallet` — balances / portfolio
- `moonpay-swap-tokens` — swap / bridge
- `moonpay-discover-tokens` — search / prices
- `moonpay-buy-crypto` — fiat buy checkout
- `moonpay-deposit` — deposit links
- `moonpay-block-explorer` — explorers
- `moonpay-export-data` — CSV/JSON export
- `moonpay-virtual-account` — fiat on/off ramp accounts
- `moonpay-hardware-wallet` — Ledger
- `moonpay-upgrade` — rate limits via x402
- `moonpay-x402` — paid API requests
- `moonpay-feedback` — feedback
- `moonpay-missions` — guided tour

## Trading & markets

- `moonpay-prediction-market` — Polymarket / Kalshi
- `moonpay-fund-polymarket` — fund Polymarket USDC.e
- `moonpay-scout` — prediction arbitrage scanner
- `moonpay-trading-automation` — DCA / limit / stop
- `moonpay-price-alerts` — desktop price alerts
- `moonpay-commerce` — Shopify crypto checkout
- `moonpay-wallet-statusline` / `moonpay-wallet-statusline-refresh`

## Research & partners

- `messari-x402`, `messari-token-research`, `messari-alpha-scout`, `messari-funding-intel`, `messari-deep-research`
- `alchemy-api`, `alchemy-agentic-gateway`
- `allium-onchain-data`, `allium-x402`
- `dune-analytics`, `zerion-wallet-data`, `nansen-dca-tracker`
- `corbits-marketplace`, `myriad-prediction-markets`
- `maiat-token-safety`, `maiat-trust-check`
- `shipp-sports-data`, `thoughtproof-reasoning-check`, `yield-optimization`

## Cheshire mcp-server

When tools are available on the Pump/Cheshire MCP server (`mcp-server/`):

- MoonPay: `get_moonpay_status`, `get_moonpay_currencies`, `get_moonpay_buy_quote`, `get_moonpay_buy_url`, `get_moonpay_cli_connect`
- PayBox: `get_paybox_connect`, `set_paybox_session`, `get_paybox_health`, `get_paybox_oauth_metadata`, `list_paybox_mcp_tools`, `call_paybox_mcp_tool`

See `moonpay` and `paybox` for env vars and auth rules.
