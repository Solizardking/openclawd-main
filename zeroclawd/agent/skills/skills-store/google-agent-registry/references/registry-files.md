# Google Agent Registry — file map

All paths relative to repo root. Project: **x402-477302**.

## Required artifacts

| Path | Role | Hard limit |
|------|------|------------|
| `registry/google/cheshire-agent-card.json` | A2A agent card (v0.3) | ≤ 10 KB |
| `registry/google/cheshire-mcp-tools-list.json` | MCP tool-spec (`tools[]`) | ≤ 10 KB |
| `registry/google/cheshire-mcp-interface.json` | `protocolBinding: mcp` | small |
| `registry/google/cheshire-mcp-server-card.json` | MCP server card mirror | small |
| `registry/google/openapi-zero-service.yaml` | Swagger 2.0 + `x-google-backend` | for zero-service / gateway |

## Agent card essentials

Must include:

- `name`, `displayName`, `description`, `url`, `version`, `protocolVersion`
- `interfaces[]` with MCP (`https://cheshireterminal.ai/mcp`) and REST OpenAPI
- `securitySchemes.cheshireApiKey` (HTTP bearer)
- `skills[]` for discovery / arena / boxes
- `extensions.cheshireTerminal` discovery URLs:
  - `mcpDiscoveryUrl`
  - `mcpServerCardUrl`
  - `agentCardUrl`
  - `llmsTxtUrl`
  - `openapiUrl`
  - `arenaRoomsUrl`

Public mirror: `GET https://cheshireterminal.ai/.well-known/agent-card.json`

## Tools list essentials

```json
{
  "tools": [
    {
      "name": "cheshire_api_discovery",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ]
}
```

`name` **must** equal the MCP tool `title` from `server/mcp/tools.ts`.

Current 12 tools:

1. `cheshire_api_discovery`
2. `cheshire_arena_list_rooms`
3. `cheshire_arena_get_room`
4. `cheshire_arena_create_room`
5. `cheshire_arena_join_room`
6. `cheshire_arena_post_message`
7. `cheshire_box_list_agents`
8. `cheshire_box_list`
9. `cheshire_box_create`
10. `cheshire_box_create_session`
11. `cheshire_box_post_session_message`
12. `cheshire_agent_handoff`

## MCP interface card

`cheshire-mcp-interface.json` should declare MCP binding for registry association (protocolBinding mcp + URL). Keep aligned with live `/mcp` transport (streamable-http).

## Validation

```bash
pnpm run validate:google-registry
# runs scripts/google-cloud/validate-google-registry.mjs (+ optional --health)
```

Checks typically include:

- JSON parse
- file size ≤ 10 KB for card + tools
- required fields present
- tool name set matches server tools when parity mode is on

## Registration

```bash
pnpm run register:google-agent
# → scripts/google-cloud/register-agent-registry.sh
```

Requires:

- `gcloud` authenticated to `x402-477302`
- `gcloud alpha` agent-registry commands available
- validated artifacts (run validate first)

## Size budget tips

- Prefer short descriptions
- Avoid embedding full OpenAPI in the A2A card
- Link to `openapi.json` / `llms.txt` instead of inlining
- Keep `examples` to one short string per skill
