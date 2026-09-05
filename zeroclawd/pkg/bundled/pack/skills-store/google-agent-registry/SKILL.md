---
name: google-agent-registry
description: >
  Maintain and register Cheshire Google Agent Registry artifacts under registry/google
  (A2A agent card, MCP tools list, MCP interface, server card, zero-service OpenAPI) and
  deploy Apigee reverse proxies on project x402-477302. Use for gcloud agent-registry,
  10 KB size limits, tool-name parity with server/mcp/tools.ts, Apigee test-env, or
  validate:google-registry / register:google-agent.
license: MIT
version: "1.1.0"
compatibility: gcloud alpha agent-registry for live register; network for health probes
metadata:
  author: cheshire-terminal
  version: "1.1.0"
  gcp_project: x402-477302
  homepage: https://cheshireterminal.ai/api-docs
---

# Google Agent Registry + Apigee

## Operating flow

1. Edit sources under `registry/google/` (never invent tool names)
2. Keep A2A card + tools list **≤ 10 KB** each
3. `pnpm run validate:google-registry`
4. Live register: `pnpm run register:google-agent` (needs gcloud auth)
5. Apigee: `pnpm run deploy:apigee:myproxy` / `deploy:apigee:zero`

Load details when needed:

- [references/registry-files.md](references/registry-files.md) — file roles, size limits, extensions
- [references/apigee.md](references/apigee.md) — proxies, hostnames, smoke
- [scripts/check-registry.sh](scripts/check-registry.sh) — local size + parity smoke

## Hard rules

| Rule | Why |
|------|-----|
| MCP tool `name`s == `createCheshireTools()` `title`s | Registry + live MCP must match |
| Agent card ≤ 10 KB | Google Agent Registry limit |
| Tools list ≤ 10 KB | Google Agent Registry limit |
| Agent card includes MCP interface + discovery extensions | A2A discoverability |
| Apigee BASE env: **STANDARD** proxies only | No extensible-only policies on BASE |

## Commands

```bash
pnpm run validate:google-registry
pnpm run register:google-agent
pnpm run deploy:apigee:myproxy
pnpm run deploy:apigee:zero

# Local skill script (size + key fields)
bash skills-store/google-agent-registry/scripts/check-registry.sh
```

## Live probes

```bash
curl -sS https://cheshireterminal.ai/.well-known/agent-card.json | head -c 200
curl -sS https://34.54.168.40.nip.io/myproxy
curl -sS https://34.54.168.40.nip.io/zero/health
```

## Project facts

| Key | Value |
|-----|-------|
| GCP project | `x402-477302` |
| Location | `us-central1` |
| A2A service | `cheshire-terminal` |
| MCP service | `cheshire-terminal-mcp` |
| ADK `ApiRegistry.get_toolset` | `projects/x402-477302/locations/us-central1/mcpServers/agentregistry-00000000-0000-0000-2490-10e4bb2ec4c0` |
| Agent Registry service | `projects/x402-477302/locations/us-central1/services/cheshire-terminal-mcp` |
| Apigee env | `test-env` (BASE) |
| Env hostname | `34.54.168.40.nip.io` |
| Zero-service | Cloud Run `clawd-zero-service` (us-central1) |

Canonical path file: `registry/google/canonical-mcp-resource.json`  
ADK sample: `python3 scripts/google-cloud/adk_cheshire_mcp_agent.py --print-path-only`

Full GCP map: repo `GOOGLE.md`.

## When tools change

1. Update `server/mcp/tools.ts`
2. Sync `registry/google/cheshire-mcp-tools-list.json`
3. Update agent card skills list if user-facing capabilities changed
4. Re-run `validate:google-registry`
5. Re-register if publishing to Google Agent Registry
