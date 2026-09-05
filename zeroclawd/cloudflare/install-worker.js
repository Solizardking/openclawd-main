const DEFAULT_UPSTREAM =
  "https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install.sh";
const DEFAULT_NPM_UPSTREAM =
  "https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install-npm.sh";
const DEFAULT_PROJECT_REPO = "https://github.com/Solizardking/Zero-Bruh";
const DEFAULT_ECOSYSTEM_HUB = "https://github.com/solizardking/solana-clawd";
const DEFAULT_X402_GATEWAY = "https://zk.x402.wtf";
const DEFAULT_TERMINAL_URL = "https://cheshireterminal.ai";
const DEFAULT_ZERO_CLAWD_URL = "https://cheshireterminal.ai/zeroclawd";
const DEFAULT_AGENT_HUB_URL = "https://cheshireterminal.ai/agents";
const DEFAULT_AGENT_FORGE_URL = "https://cheshireterminal.ai/agents/forge";
const DEFAULT_AGENTS_NPM =
  "https://www.npmjs.com/package/cheshire-terminal-agents";
const DEFAULT_AGENTS_REPO =
  "https://github.com/Solizardking/Cheshire-Terminal-Agents";
const DEFAULT_SKILLHUB_REPO = "https://github.com/Solizardking/skillhub-main";
const DEFAULT_ZK_PROGRAM_ID = "CLAWDzk11111111111111111111111111111111111";

const BASE_PREFIXES = ["/clawdbot"];
const JSON_ROUTES = new Set([
  "/.well-known/clawdbot-install.json",
  "/.well-known/clawdbot-zk.json",
  "/.well-known/zk-primitives.json",
  "/catalog",
  "/metadata.json",
  "/routes",
  "/zk",
  "/zk.json",
]);

function stripBasePath(pathname) {
  for (const prefix of BASE_PREFIXES) {
    if (pathname === prefix || pathname === `${prefix}/`) {
      return "/";
    }
    if (pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length);
    }
  }
  return pathname;
}

function basePath(pathname) {
  for (const prefix of BASE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return "";
}

function envValue(env, key, fallback) {
  const value = env[key];
  return value === undefined || value === null || value === "" ? fallback : value;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function corsHeaders(headers = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    ...headers,
  };
}

function scriptHeaders(upstream) {
  return corsHeaders({
    "content-type": "text/x-shellscript; charset=utf-8",
    "cache-control": "public, max-age=60",
    "x-clawdbot-upstream": upstream,
  });
}

function jsonResponse(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: corsHeaders({
      "cache-control": "public, max-age=60",
      ...(init.headers || {}),
    }),
  });
}

function textResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: corsHeaders({
      "content-type": "text/plain; charset=utf-8",
      ...(init.headers || {}),
    }),
  });
}

function finalizeResponse(request, response) {
  if (request.method === "HEAD") {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  return response;
}

function installCommands(origin, base) {
  return {
    complete: `curl -fsSL ${origin}${base} | bash`,
    raw: `curl -fsSL ${origin}${base}/install.sh | bash`,
    /** Grok Build–style npm oneshot: skills pack + agent dirs + env */
    npm: `curl -fsSL ${origin}${base}/install-npm.sh | bash`,
    npmNpx: `npx clawdbot-go install`,
    coreAI: `curl -fsSL ${origin}${base}/core-ai | bash`,
    zkMetadata: `curl -fsSL ${origin}${base}/.well-known/clawdbot-zk.json`,
  };
}

function routes(origin, base) {
  return [
    {
      path: `${base || "/"}`,
      behavior: "complete install wrapper",
      command: `curl -fsSL ${origin}${base} | bash`,
    },
    {
      path: `${base}/complete`,
      behavior: "complete install wrapper",
    },
    {
      path: `${base}/full`,
      behavior: "complete install wrapper",
    },
    {
      path: `${base}/core-ai`,
      behavior: "installer wrapper with CLAWDBOT_INSTALL_CORE_AI=1",
    },
    {
      path: `${base}/install.sh`,
      behavior: "raw upstream installer proxy",
    },
    {
      path: `${base}/install-npm.sh`,
      behavior: "npm oneshot installer (skills + agents + env)",
      command: `curl -fsSL ${origin}${base}/install-npm.sh | bash`,
    },
    {
      path: `${base}/npm`,
      behavior: "npm oneshot installer alias",
      command: `curl -fsSL ${origin}${base}/install-npm.sh | bash`,
    },
    {
      path: `${base}/raw`,
      behavior: "raw upstream installer proxy",
    },
    {
      path: `${base}/lite`,
      behavior: "raw upstream installer proxy",
    },
    {
      path: `${base}/healthz`,
      behavior: "plain health check",
    },
    {
      path: `${base}/.well-known/clawdbot-install.json`,
      behavior: "installer metadata",
    },
    {
      path: `${base}/.well-known/clawdbot-zk.json`,
      behavior: "ZK primitive metadata",
    },
    {
      path: `${base}/zk`,
      behavior: "ZK primitive metadata alias",
    },
    {
      path: `${base}/zk.json`,
      behavior: "ZK primitive metadata alias",
    },
    {
      path: `${base}/metadata.json`,
      behavior: "combined installer and ZK metadata",
    },
  ];
}

function zkMetadata(url, env) {
  const origin = `${url.protocol}//${url.host}`;
  const base = basePath(url.pathname);
  const repo = envValue(env, "PROJECT_REPO", DEFAULT_PROJECT_REPO);
  return {
    name: "Clawd ZK Primitives",
    slug: "clawd-zk-primitives",
    status: "scaffold-production-facing",
    root: "zk-primitives",
    manifest: `${repo}/blob/main/zk-primitives/MANIFEST.json`,
    docs: {
      readme: `${repo}/blob/main/zk-primitives/README.md`,
      reference: `${repo}/blob/main/zk-primitives/zk.md`,
      architecture: `${repo}/blob/main/zk-primitives/docs/ARCHITECTURE.md`,
      integration: `${repo}/blob/main/zk-primitives/docs/INTEGRATION.md`,
      edgeDistribution: `${repo}/blob/main/zk-primitives/docs/EDGE_DISTRIBUTION.md`,
    },
    packages: {
      agent: envValue(env, "ZK_AGENT_PACKAGE", "@clawd/zk-shark-agent"),
      client: envValue(env, "ZK_CLIENT_PACKAGE", "@clawd/zk-client"),
      program: {
        name: "clawd-zk",
        programId: envValue(env, "ZK_PROGRAM_ID", DEFAULT_ZK_PROGRAM_ID),
      },
    },
    operations: [
      "publish_attestation",
      "consume_attestation",
      "commit_encrypted_state",
      "verify_proof",
      "compute_nullifier",
    ],
    trustGate: {
      inspect: "observer",
      verifyProofShape: "observer",
      computeNullifier: "observer",
      buildInstruction: "dry-run",
      signAndSend: "delegated",
    },
    environment: {
      localRoot: "CLAWDBOT_ZK_PRIMITIVES_DIR",
      rpc: ["ZK_SHARK_RPC_URL", "CLAWD_ZK_RPC_URL"],
      programId: ["ZK_SHARK_PROGRAM_ID", "CLAWD_ZK_PROGRAM_ID"],
      photon: ["ZK_SHARK_PHOTON_URL", "CLAWD_ZK_PHOTON_URL"],
    },
    commands: {
      catalog: "clawdbot catalog zk",
      metadata: `curl -fsSL ${origin}${base}/.well-known/clawdbot-zk.json`,
    },
  };
}

function metadata(url, env) {
  const origin = `${url.protocol}//${url.host}`;
  const base = basePath(url.pathname);
  const upstream = envValue(env, "UPSTREAM_INSTALL_URL", DEFAULT_UPSTREAM);
  return {
    name: "clawdbot-go",
    product: "Clawd Bot",
    repo: envValue(env, "PROJECT_REPO", DEFAULT_PROJECT_REPO),
    ecosystemHub: envValue(env, "ECOSYSTEM_HUB", DEFAULT_ECOSYSTEM_HUB),
    x402Gateway: envValue(env, "X402_GATEWAY", DEFAULT_X402_GATEWAY),
    terminal: envValue(env, "TERMINAL_URL", DEFAULT_TERMINAL_URL),
    clawdBot: envValue(env, "ZERO_CLAWD_URL", DEFAULT_ZERO_CLAWD_URL),
    zeroClawd: envValue(env, "ZERO_CLAWD_URL", DEFAULT_ZERO_CLAWD_URL),
    agentHub: envValue(env, "AGENT_HUB_URL", DEFAULT_AGENT_HUB_URL),
    agentForge: envValue(env, "AGENT_FORGE_URL", DEFAULT_AGENT_FORGE_URL),
    agentsNpm: envValue(env, "AGENTS_NPM_URL", DEFAULT_AGENTS_NPM),
    agentsRepo: envValue(env, "AGENTS_REPO_URL", DEFAULT_AGENTS_REPO),
    skillHubRepo: envValue(env, "SKILLHUB_REPO_URL", DEFAULT_SKILLHUB_REPO),
    upstreamInstall: upstream,
    basePath: base || "/",
    commands: installCommands(origin, base),
    localCatalogRoots: {
      skills: {
        path: "~/skills/skills",
        env: "CLAWDBOT_SKILLS_DIR",
      },
      agents: {
        path: "~/agents/agents/src",
        env: "CLAWDBOT_AGENTS_DIR",
      },
      zkPrimitives: {
        path: "./zk-primitives",
        env: "CLAWDBOT_ZK_PRIMITIVES_DIR",
      },
    },
    routes: routes(origin, base),
    zkPrimitives: zkMetadata(url, env),
  };
}

function wrapperScript(env, options = {}) {
  const upstream = envValue(env, "UPSTREAM_INSTALL_URL", DEFAULT_UPSTREAM);
  const complete = options.complete ?? envValue(env, "DEFAULT_COMPLETE", "1");
  const coreAI = options.coreAI ? "1" : "";
  const zkDir = envValue(env, "DEFAULT_ZK_PRIMITIVES_DIR", "");
  const exports = [
    complete
      ? `: "\${CLAWDBOT_INSTALL_COMPLETE:=${complete}}"\nexport CLAWDBOT_INSTALL_COMPLETE`
      : "",
    coreAI
      ? `: "\${CLAWDBOT_INSTALL_CORE_AI:=${coreAI}}"\nexport CLAWDBOT_INSTALL_CORE_AI`
      : "",
    zkDir
      ? `: "\${CLAWDBOT_ZK_PRIMITIVES_DIR:=${zkDir}}"\nexport CLAWDBOT_ZK_PRIMITIVES_DIR`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `#!/usr/bin/env bash
set -euo pipefail

${exports}

curl -fsSL ${shellQuote(upstream)} | bash
`;
}

async function proxyInstall(env, options = {}) {
  const upstream = options.npm
    ? envValue(env, "UPSTREAM_NPM_INSTALL_URL", DEFAULT_NPM_UPSTREAM)
    : envValue(env, "UPSTREAM_INSTALL_URL", DEFAULT_UPSTREAM);
  const response = await fetch(upstream, {
    cf: { cacheEverything: true, cacheTtl: 60 },
  });

  if (!response.ok) {
    return textResponse(`upstream installer fetch failed: ${response.status}\n`, {
      status: 502,
    });
  }

  return new Response(response.body, {
    status: 200,
    headers: scriptHeaders(upstream),
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const path = stripBasePath(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("method not allowed\n", {
        status: 405,
        headers: { allow: "GET, HEAD, OPTIONS" },
      });
    }

    if (path === "/healthz") {
      return finalizeResponse(request, textResponse("ok\n"));
    }

    if (path === "/routes") {
      const origin = `${url.protocol}//${url.host}`;
      return finalizeResponse(request, jsonResponse({ routes: routes(origin, basePath(url.pathname)) }));
    }

    if (
      path === "/.well-known/clawdbot-install.json" ||
      path === "/metadata.json" ||
      path === "/catalog"
    ) {
      return finalizeResponse(request, jsonResponse(metadata(url, env)));
    }

    if (
      path === "/.well-known/clawdbot-zk.json" ||
      path === "/.well-known/zk-primitives.json" ||
      path === "/zk" ||
      path === "/zk.json"
    ) {
      return finalizeResponse(request, jsonResponse(zkMetadata(url, env)));
    }

    if (path === "/" || path === "/complete" || path === "/full") {
      const upstream = envValue(env, "UPSTREAM_INSTALL_URL", DEFAULT_UPSTREAM);
      return finalizeResponse(
        request,
        new Response(wrapperScript(env, { complete: "1" }), {
          headers: scriptHeaders(upstream),
        }),
      );
    }

    if (path === "/core-ai") {
      const upstream = envValue(env, "UPSTREAM_INSTALL_URL", DEFAULT_UPSTREAM);
      return finalizeResponse(
        request,
        new Response(wrapperScript(env, { complete: "", coreAI: true }), {
          headers: scriptHeaders(upstream),
        }),
      );
    }

    if (path === "/install.sh" || path === "/raw" || path === "/lite") {
      return finalizeResponse(request, await proxyInstall(env));
    }

    if (path === "/install-npm.sh" || path === "/npm" || path === "/oneshot") {
      return finalizeResponse(request, await proxyInstall(env, { npm: true }));
    }

    if (JSON_ROUTES.has(path)) {
      return finalizeResponse(request, jsonResponse(metadata(url, env)));
    }

    return textResponse("not found\n", {
      status: 404,
    });
  },
};
