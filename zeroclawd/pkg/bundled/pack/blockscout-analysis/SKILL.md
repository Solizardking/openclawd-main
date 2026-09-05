---
name: blockscout-analysis
description: "MANDATORY before Blockscout MCP tool calls or multichain wallet/tx/token analysis via MCP. Wires BLOCKSCOUT_API_KEY into the hosted Blockscout MCP server (https://mcp.blockscout.com/mcp) for Clawd Bot agents. Use for on-chain balances, txs, NFTs, contract ABI/source, RH chain 4663 explorer intel, and agent host setup (Cursor, Claude Code, Codex). Sibling web3-dev covers direct PRO REST HTTP."
license: MIT
metadata: {"author":"blockscout.com + Clawd Bot","version":"0.1.0","github":"https://github.com/blockscout/mcp-server","support":"https://discord.gg/blockscout"}
---

# Blockscout Analysis (MCP)

Analyze blockchain activity through the **Blockscout MCP Server**. Clawd Bot wires your
existing **`BLOCKSCOUT_API_KEY`** (`proapi_…` from [dev.blockscout.com](https://dev.blockscout.com))
into the MCP host as header **`Blockscout-MCP-Pro-Api-Key`**.

For raw PRO API HTTP in application code, use the sibling skill **`web3-dev`**.

## Infrastructure

| Access | URL | Auth |
|--------|-----|------|
| Native MCP (agents) | `https://mcp.blockscout.com/mcp` | Header `Blockscout-MCP-Pro-Api-Key: $BLOCKSCOUT_API_KEY` |
| MCP REST (scripts) | `https://mcp.blockscout.com/v1/{tool}` | Same header |
| Tool list | `GET https://mcp.blockscout.com/v1/tools` | None |
| Health | `GET https://mcp.blockscout.com/health` | None |

Optional override: `BLOCKSCOUT_MCP_URL` (default `https://mcp.blockscout.com/mcp`).

Alias env accepted by Clawd Bot config: `BLOCKSCOUT_PRO_API_KEY` (prefer `BLOCKSCOUT_API_KEY`).

### Clawd Bot runtime

```bash
export BLOCKSCOUT_API_KEY=proapi_…   # never commit
clawdbot doctor                      # connectors.blockscout_mcp
# Web console:
#   GET /api/mcp/blockscout   — status + redacted host configs
#   GET /api/connectors       — "Blockscout MCP" row
#   GET /api/rh/readiness     — RH launch gate (key + RH_RPC_URL)
```

Go packages:

- `pkg/mcp` — `DefaultConfigWithBlockscout`, `AssessBlockscout`, `CallREST`, host config exporters, `RegisterBlockscoutTools`
- `pkg/config` — `RobinhoodConfig.BlockscoutAPIKey` from env
- `pkg/rh` — PRO REST client for chain **4663**

### Agent tool names (clawdbot REPL / zero)

Registered automatically from `BLOCKSCOUT_API_KEY` (default `chain_id=4663`):

| Tool | MCP backend |
|------|-------------|
| `blockscout_unlock` | `unlock_blockchain_analysis` |
| `blockscout_chains` | `get_chains_list` |
| `blockscout_address_info` | `get_address_info` |
| `blockscout_block_number` | `get_block_number` |
| `blockscout_transactions` | `get_transactions_by_address` |
| `blockscout_token_transfers` | `get_token_transfers_by_address` |
| `blockscout_transaction` | `get_transaction_info` |
| `blockscout_contract_abi` | `get_contract_abi` |
| `blockscout_tokens` | `get_tokens_by_address` |
| `blockscout_direct_api` | `direct_api_call` |

Call `blockscout_unlock` once per session before other tools.

### Host setup (copy-paste)

**Cursor** (`.cursor/mcp.json` or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "blockscout": {
      "url": "https://mcp.blockscout.com/mcp",
      "timeout": 180000,
      "headers": {
        "Blockscout-MCP-Pro-Api-Key": "proapi_YOUR_KEY",
        "Blockscout-MCP-Intermediary": "ClawdBot"
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add --transport http blockscout https://mcp.blockscout.com/mcp \
  --header "Blockscout-MCP-Pro-Api-Key: $BLOCKSCOUT_API_KEY"
```

**Codex** (`~/.codex/config.toml`):

```toml
[features]
experimental_use_rmcp_client = true

[mcp_servers.Blockscout]
url = "https://mcp.blockscout.com/mcp"
http_headers = { "Blockscout-MCP-Pro-Api-Key" = "proapi_YOUR_KEY" }
```

Never paste the key into chat. Prefer `export` or a gitignored `.env`.

## Session rules

1. **Unlock first.** Call `__unlock_blockchain_analysis__` (REST: `unlock_blockchain_analysis`) once per session before other tools.
2. **Resolve chain_id.** Prefer `get_chains_list(query=...)` — for Robinhood use `query=robinhood` → **`chain_id=4663`**.
3. Prefer dedicated MCP tools over `direct_api_call`. Use `direct_api_call` only when no dedicated tool covers the need.
4. Follow `pagination.next_call` when present; pages are ~10 items.
5. Retry **5xx** up to 3 times; do **not** retry **4xx**.
6. Never log or echo the PRO key. Status APIs expose only presence / last-4 suffix.

## Tools (16)

| Tool | Purpose |
|------|---------|
| `__unlock_blockchain_analysis__` | Mandatory session init |
| `get_chains_list` | Supported chains (filter with `query`) |
| `get_address_by_ens_name` | ENS → address |
| `get_address_info` | Balance, contract flags, tags |
| `get_tokens_by_address` | ERC-20 holdings |
| `nft_tokens_by_address` | NFT inventory |
| `get_transactions_by_address` | Tx history (`age_from` / `age_to`) |
| `get_token_transfers_by_address` | Token transfers |
| `get_transaction_info` | Decoded tx + transfers |
| `get_block_info` / `get_block_number` | Block lookup / time→block |
| `get_contract_abi` / `inspect_contract_code` | Verified contracts |
| `read_contract` | eth_call-style reads |
| `lookup_token_by_symbol` | Symbol search |
| `direct_api_call` | Raw Blockscout API path |

## Robinhood Chain (default for RH pack)

| Field | Value |
|-------|-------|
| Chain ID | **4663** |
| Explorer | https://robinhoodchain.blockscout.com |
| PRO base | https://api.blockscout.com |
| Public RPC (read-only) | https://rpc.mainnet.chain.robinhood.com |

Example MCP REST probe (no key required for some read tools):

```bash
curl -sS "https://mcp.blockscout.com/v1/get_chains_list?query=robinhood"
curl -sS "https://mcp.blockscout.com/v1/get_block_number?chain_id=4663"
curl -sS -H "Blockscout-MCP-Pro-Api-Key: $BLOCKSCOUT_API_KEY" \
  "https://mcp.blockscout.com/v1/get_address_info?chain_id=4663&address=0x…"
```

## Decision: MCP vs web3-dev PRO REST

| Need | Use |
|------|-----|
| Agent Q&A, wallet history, contract explain | **This skill (MCP)** |
| Ship an app/script with Bearer REST + OpenAPI | **`web3-dev`** |
| RH launch/deploy gate | `pkg/rh` readiness + `BLOCKSCOUT_API_KEY` + `RH_RPC_URL` |

## Docs

- MCP docs: https://docs.blockscout.com/devs/mcp-server
- MCP landing: https://mcp.blockscout.com
- PRO portal: https://dev.blockscout.com
- Upstream server: https://github.com/blockscout/mcp-server
- Upstream analysis skill (full framework): https://github.com/blockscout/agent-skills/tree/main/blockscout-analysis
