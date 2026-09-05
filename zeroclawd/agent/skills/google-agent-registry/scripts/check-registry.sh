#!/usr/bin/env bash
# Local Google Agent Registry size + structural checks (no gcloud required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REG="${ROOT}/registry/google"
failed=0
MAX_BYTES=10240

bytes() {
  wc -c < "$1" | tr -d ' '
}

check_file() {
  local f="$1" max="${2:-0}"
  if [[ ! -f "$f" ]]; then
    echo "FAIL  missing $(basename "$f")"
    failed=$((failed + 1))
    return
  fi
  local n
  n=$(bytes "$f")
  if [[ "$max" -gt 0 && "$n" -gt "$max" ]]; then
    echo "FAIL  $(basename "$f") ${n}B > ${max}B"
    failed=$((failed + 1))
  else
    echo "PASS  $(basename "$f") ${n}B"
  fi
}

echo "google-agent-registry check → ${REG}"

check_file "${REG}/cheshire-agent-card.json" "$MAX_BYTES"
check_file "${REG}/cheshire-mcp-tools-list.json" "$MAX_BYTES"
check_file "${REG}/cheshire-mcp-interface.json" 0
check_file "${REG}/cheshire-mcp-server-card.json" 0
check_file "${REG}/openapi-zero-service.yaml" 0

# JSON validity + required tools
REG="$REG" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { join } from "node:path";

const reg = process.env.REG;
if (!reg) {
  console.log("FAIL  REG env not set");
  process.exit(1);
}
const card = JSON.parse(readFileSync(join(reg, "cheshire-agent-card.json"), "utf8"));
const toolsDoc = JSON.parse(readFileSync(join(reg, "cheshire-mcp-tools-list.json"), "utf8"));
const required = [
  "cheshire_api_discovery",
  "cheshire_arena_list_rooms",
  "cheshire_arena_get_room",
  "cheshire_arena_create_room",
  "cheshire_arena_join_room",
  "cheshire_arena_post_message",
  "cheshire_box_list_agents",
  "cheshire_box_list",
  "cheshire_box_create",
  "cheshire_box_create_session",
  "cheshire_box_post_session_message",
  "cheshire_agent_handoff",
];

let failed = 0;
const names = (toolsDoc.tools || []).map((t) => t.name);
for (const r of required) {
  if (!names.includes(r)) {
    console.log(`FAIL  tools list missing ${r}`);
    failed++;
  }
}
if (!card.url) {
  console.log("FAIL  agent card missing url");
  failed++;
} else {
  console.log(`PASS  agent card url=${card.url}`);
}
if (!card.interfaces?.length) {
  console.log("FAIL  agent card missing interfaces");
  failed++;
} else {
  console.log(`PASS  agent card interfaces=${card.interfaces.length}`);
}
if (failed === 0) {
  console.log(`PASS  all ${required.length} MCP tool names present`);
}
process.exit(failed > 0 ? 1 : 0);
NODE

node_status=$?
if [[ $node_status -ne 0 ]]; then
  failed=$((failed + 1))
fi

# Prefer full repo validator when available (static only; optional live health is separate)
if [[ -f "${ROOT}/scripts/google-cloud/validate-google-registry.mjs" ]]; then
  echo ""
  echo "Running pnpm validate:google-registry …"
  (cd "$ROOT" && pnpm run validate:google-registry) || failed=$((failed + 1))
fi

# Canonical ADK path must be present and non-placeholder
if [[ -f "${REG}/canonical-mcp-resource.json" ]]; then
  REG="$REG" node --input-type=module <<'NODE' || failed=$((failed + 1))
import { readFileSync } from "node:fs";
const reg = process.env.REG;
const c = JSON.parse(readFileSync(`${reg}/canonical-mcp-resource.json`, "utf8"));
const expectedService = "projects/x402-477302/locations/us-central1/services/cheshire-terminal-mcp";
const expectedMcp =
  "projects/x402-477302/locations/us-central1/mcpServers/agentregistry-00000000-0000-0000-2490-10e4bb2ec4c0";
if (c.resourceName !== expectedService || c.adk?.getMcpToolsetArg !== expectedService) {
  console.log("FAIL  canonical service resource path mismatch");
  process.exit(1);
}
if (c.mcpServerResourceName !== expectedMcp || c.adk?.getToolsetArg !== expectedMcp) {
  console.log("FAIL  canonical mcpServers resource path mismatch");
  process.exit(1);
}
console.log(`PASS  service resource ${c.resourceName}`);
console.log(`PASS  ApiRegistry mcpServers ${c.mcpServerResourceName}`);
NODE
else
  echo "FAIL  missing canonical-mcp-resource.json"
  failed=$((failed + 1))
fi

echo ""
echo "Failed groups: ${failed}"
exit "${failed}"
