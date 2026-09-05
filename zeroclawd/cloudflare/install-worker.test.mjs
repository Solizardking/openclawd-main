import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const source = await readFile(new URL("./install-worker.js", import.meta.url), "utf8");
  const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  const mod = await import(moduleUrl);
  return mod.default;
}

test("metadata includes install commands and ZK primitive surface", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://x402.wtf/clawdbot/.well-known/clawdbot-install.json"),
    {
      PROJECT_REPO: "https://github.com/Solizardking/Zero-Bruh",
      ZK_AGENT_PACKAGE: "@clawd/zk-shark-agent",
      ZK_CLIENT_PACKAGE: "@clawd/zk-client",
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");

  const body = await response.json();
  assert.equal(body.commands.complete, "curl -fsSL https://x402.wtf/clawdbot | bash");
  assert.equal(
    body.commands.zkMetadata,
    "curl -fsSL https://x402.wtf/clawdbot/.well-known/clawdbot-zk.json",
  );
  assert.equal(body.zkPrimitives.packages.agent, "@clawd/zk-shark-agent");
  assert.equal(body.zkPrimitives.packages.client, "@clawd/zk-client");
  assert.ok(body.zkPrimitives.operations.includes("publish_attestation"));
  assert.equal(body.terminal, "https://cheshireterminal.ai");
  assert.equal(body.product, "Clawd Bot");
  assert.equal(body.clawdBot, "https://cheshireterminal.ai/zeroclawd");
  assert.equal(body.zeroClawd, "https://cheshireterminal.ai/zeroclawd");
  assert.equal(body.agentHub, "https://cheshireterminal.ai/agents");
  assert.equal(body.agentForge, "https://cheshireterminal.ai/agents/forge");
  assert.equal(
    body.agentsNpm,
    "https://www.npmjs.com/package/cheshire-terminal-agents",
  );
  assert.equal(
    body.agentsRepo,
    "https://github.com/Solizardking/Cheshire-Terminal-Agents",
  );
  assert.equal(body.skillHubRepo, "https://github.com/Solizardking/skillhub-main");
});

test("ZK metadata alias is read-only JSON", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("https://zk.x402.wtf/clawdbot/zk"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);

  const body = await response.json();
  assert.equal(body.slug, "clawd-zk-primitives");
  assert.equal(body.trustGate.signAndSend, "delegated");
  assert.equal(body.environment.localRoot, "CLAWDBOT_ZK_PRIMITIVES_DIR");
});

test("complete wrapper exports installer and ZK defaults", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("https://install.onchainai.fund/"), {
    UPSTREAM_INSTALL_URL: "https://example.test/install.sh",
    DEFAULT_ZK_PRIMITIVES_DIR: "$HOME/.clawdbot/src/zk-primitives",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/x-shellscript/);

  const body = await response.text();
  assert.match(body, /export CLAWDBOT_INSTALL_COMPLETE/);
  assert.match(body, /export CLAWDBOT_ZK_PRIMITIVES_DIR/);
  assert.match(body, /curl -fsSL 'https:\/\/example\.test\/install\.sh' \| bash/);
});

test("HEAD health check has headers without a body", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://install.onchainai.fund/healthz", { method: "HEAD" }),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("content-type") || "", /text\/plain/);
});

test("unsupported methods are rejected", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://install.onchainai.fund/install.sh", { method: "POST" }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD, OPTIONS");
});

test("raw installer proxy preserves script headers", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response("#!/usr/bin/env bash\n", {
      status: String(url).includes("install.sh") ? 200 : 404,
    });

  try {
    const response = await worker.fetch(
      new Request("https://install.onchainai.fund/install.sh"),
      { UPSTREAM_INSTALL_URL: "https://example.test/install.sh" },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-clawdbot-upstream"), "https://example.test/install.sh");
    assert.equal(await response.text(), "#!/usr/bin/env bash\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
