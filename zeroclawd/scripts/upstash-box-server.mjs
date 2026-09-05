#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const RAW_INSTALL =
  process.env.CLAWDBOT_RAW_INSTALL_URL ||
  "https://raw.githubusercontent.com/Solizardking/Zero-Bruh/main/install.sh";
const PORT = Number(process.env.PORT || process.env.CLAWDBOT_BOX_PORT || "3000");
const DATA_DIR = process.env.CLAWDBOT_BOX_DATA_DIR || "/tmp/clawdbot-box";
const INSTALL_LEDGER =
  process.env.CLAWDBOT_INSTALL_LEDGER || join(DATA_DIR, "installs.jsonl");
const FUNDING_LEDGER =
  process.env.CLAWDBOT_BIRTH_FUNDING_LEDGER || join(DATA_DIR, "funding.jsonl");
const CLAWD_MINT =
  process.env.CLAWD_TOKEN_MINT ||
  process.env.CLAWDBOT_CLAWD_MINT ||
  "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

await mkdir(DATA_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      json(res, { ok: true, service: "clawdbot-box", port: PORT });
      return;
    }
    if (url.pathname === "/" && req.method === "GET") {
      const origin = publicOrigin(req);
      text(
        res,
        `Clawd Bot Box install surface\n\ncurl -fsSL ${origin}/install.sh | bash\n\nPOST ${origin}/api/install\n`,
      );
      return;
    }
    if (url.pathname === "/install.sh" && req.method === "GET") {
      const origin = publicOrigin(req);
      send(
        res,
        200,
        `#!/usr/bin/env bash
set -euo pipefail
export CLAWDBOT_INSTALL_API="${origin}/api/install"
curl -fsSL "${RAW_INSTALL}" | bash
`,
        "text/x-shellscript; charset=utf-8",
      );
      return;
    }
    if (url.pathname === "/api/install" && req.method === "POST") {
      await handleInstall(req, res);
      return;
    }
    if (url.pathname === "/api/installs" && req.method === "GET") {
      await handleInstalls(req, res, url);
      return;
    }
    json(res, { ok: false, error: "not found" }, 404);
  } catch (err) {
    json(res, { ok: false, error: sanitizeError(err) }, 500);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`clawdbot box install API listening on :${PORT}`);
});

async function handleInstall(req, res) {
  const payload = await readJSON(req);
  const installId = String(payload.installId || `cb_${randomBytes(16).toString("hex")}`);
  const recipient = String(payload.agentWalletPubkey || "").trim();
  const record = {
    installId,
    remoteIp: clientIP(req),
    userAgent: req.headers["user-agent"] || "",
    os: payload.os || "",
    arch: payload.arch || "",
    version: payload.version || "",
    installComplete: payload.installComplete || "",
    coreAi: payload.coreAi || "",
    vulcan: payload.vulcan || "",
    agentWalletPubkey: recipient,
    agentDnaId: payload.agentDnaId || "",
    fundingStatus: "skipped",
    createdAt: new Date().toISOString(),
  };

  const response = {
    ok: true,
    installId,
    zkrouterKey: process.env.ZKROUTER_API_KEY || "clawdbot-free",
    zkrouterBase: process.env.ZKROUTER_BASE_URL || "https://clawdrouter-zk.fly.dev/v1",
    rpcUrl:
      process.env.SOLANA_RPC_URL ||
      process.env.HELIUS_RPC_URL ||
      "https://zk.x402.wtf/api/solana/rpc-public",
    fundingStatus: record.fundingStatus,
  };

  if (!recipient) {
    record.fundingStatus = "skipped_no_wallet";
    response.fundingStatus = record.fundingStatus;
    await appendJSONL(INSTALL_LEDGER, record);
    json(res, response);
    return;
  }
  if (!isValidPubkey(recipient)) {
    record.fundingStatus = "skipped_invalid_wallet";
    response.fundingStatus = record.fundingStatus;
    await appendJSONL(INSTALL_LEDGER, record);
    json(res, response);
    return;
  }

  const prior = await findPriorFunding(installId, recipient);
  if (prior?.funding) {
    record.fundingStatus = "already_recorded";
    record.funding = prior.funding;
    response.fundingStatus = prior.fundingStatus || prior.funding.status;
    response.solSignature = prior.funding.solSignature || "";
    response.clawdSignature = prior.funding.clawdSignature || "";
    await appendJSONL(INSTALL_LEDGER, record);
    json(res, response);
    return;
  }

  if (!envBool("CLAWDBOT_INSTALL_FUNDING_ENABLED")) {
    record.fundingStatus = "queued";
    response.fundingStatus = record.fundingStatus;
    await appendJSONL(INSTALL_LEDGER, record);
    json(res, response);
    return;
  }

  const caps = await fundingWithinCaps(record.remoteIp);
  if (!caps.ok) {
    record.fundingStatus = "rate_limited";
    record.fundingError = caps.reason;
    response.fundingStatus = record.fundingStatus;
    response.fundingError = caps.reason;
    await appendJSONL(INSTALL_LEDGER, record);
    json(res, response);
    return;
  }

  const funding = await runFunding(recipient, payload, installId);
  record.fundingStatus = funding.status || "unknown";
  record.funding = funding;
  if (funding.error) record.fundingError = funding.error;
  response.fundingStatus = record.fundingStatus;
  response.solSignature = funding.solSignature || "";
  response.clawdSignature = funding.clawdSignature || "";
  if (funding.error) response.fundingError = funding.error;
  await appendJSONL(INSTALL_LEDGER, record);
  json(res, response);
}

async function handleInstalls(req, res, url) {
  const token = process.env.CLAWDBOT_INSTALL_ADMIN_TOKEN || "";
  if (!token || bearerToken(req) !== token) {
    json(res, { ok: false, error: "unauthorized" }, 401);
    return;
  }
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 1000);
  const records = await readJSONL(INSTALL_LEDGER);
  json(res, { ok: true, count: Math.min(limit, records.length), installs: records.slice(-limit) });
}

async function runFunding(recipient, payload, installId) {
  const clawdbot = process.env.CLAWDBOT_BIN || "clawdbot";
  if (!(await commandExists(clawdbot))) {
    return {
      status: "queued",
      send: false,
      recipient,
      error: "`clawdbot` binary is not installed in the box yet",
    };
  }

  const solLamports = Number(
    payload?.funding?.solLamports || process.env.CLAWDBOT_STARTUP_SOL_LAMPORTS || "69420000",
  );
  const clawdTokens = String(
    payload?.funding?.clawdTokens || process.env.CLAWDBOT_STARTUP_CLAWD_TOKENS || "1000",
  );
  const clawdMint = String(payload?.funding?.clawdMint || CLAWD_MINT);
  const args = [
    "solana",
    "fund-agent",
    recipient,
    "--json",
    "--sol-lamports",
    String(solLamports),
    "--clawd",
    clawdTokens,
    "--clawd-mint",
    clawdMint,
    "--ledger",
    FUNDING_LEDGER,
  ];
  if (envBool("CLAWDBOT_INSTALL_FUNDING_SEND") || envBool("CLAWDBOT_BIRTH_FUNDING_SEND")) {
    args.push("--send");
  }
  const result = await runCommand(clawdbot, args, {
    ...process.env,
    CLAWDBOT_INSTALL_ID: installId,
    CLAWDBOT_BIRTH_FUNDING_LEDGER: FUNDING_LEDGER,
  });
  const parsed = parseJSONFromOutput(result.stdout) || {};
  if (result.code !== 0) {
    parsed.status ||= "failed";
    parsed.error = sanitizeError(result.stderr || result.stdout || `funding exited ${result.code}`);
  }
  return parsed;
}

async function fundingWithinCaps(remoteIp) {
  const records = await readJSONL(INSTALL_LEDGER);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let perIp = 0;
  let total = 0;
  for (const record of records) {
    if (!record.funding) continue;
    if (
      record.funding.status !== "sent" &&
      !record.funding.solSignature &&
      !record.funding.clawdSignature
    ) {
      continue;
    }
    const created = Date.parse(record.createdAt || "");
    if (!Number.isFinite(created) || created < since) continue;
    total += 1;
    if (record.remoteIp === remoteIp) perIp += 1;
  }
  const maxPerIp = Number(process.env.CLAWDBOT_INSTALL_FUNDING_MAX_PER_IP_DAY || "3");
  const maxPerDay = Number(process.env.CLAWDBOT_INSTALL_FUNDING_MAX_PER_DAY || "100");
  if (maxPerIp > 0 && perIp >= maxPerIp) {
    return { ok: false, reason: `daily per-IP funding cap reached (${maxPerIp})` };
  }
  if (maxPerDay > 0 && total >= maxPerDay) {
    return { ok: false, reason: `daily global funding cap reached (${maxPerDay})` };
  }
  return { ok: true };
}

async function findPriorFunding(installId, recipient) {
  const records = await readJSONL(INSTALL_LEDGER);
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.installId !== installId && record.agentWalletPubkey !== recipient) continue;
    if (!record.funding) continue;
    if (
      record.funding.status === "sent" ||
      record.funding.solSignature ||
      record.funding.clawdSignature
    ) {
      return record;
    }
  }
  return null;
}

async function commandExists(command) {
  if (command.includes("/")) return existsSync(command);
  const result = await runCommand("sh", ["-lc", `command -v ${shellQuote(command)}`]);
  return result.code === 0;
}

function runCommand(command, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 127, stdout, stderr: String(err) }));
  });
}

async function readJSON(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("request body too large");
  }
  return body ? JSON.parse(body) : {};
}

async function readJSONL(path) {
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendJSONL(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(path, { flags: "a" });
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(`${JSON.stringify(value)}\n`);
  });
}

function json(res, value, status = 200) {
  send(res, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function text(res, value, status = 200) {
  send(res, status, value, "text/plain; charset=utf-8");
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "content-type": contentType,
  });
  res.end(body);
}

function publicOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

function clientIP(req) {
  const direct =
    req.headers["fly-client-ip"] ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    "";
  if (direct) return String(direct);
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || "");
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
}

function envBool(key) {
  return ["1", "true", "yes", "on"].includes(String(process.env[key] || "").toLowerCase());
}

function isValidPubkey(value) {
  try {
    return base58Decode(value).length === 32;
  } catch {
    return false;
  }
}

function base58Decode(value) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const lookup = new Map([...alphabet].map((char, index) => [char, index]));
  let bytes = [];
  for (const char of String(value)) {
    let carry = lookup.get(char);
    if (carry === undefined) throw new Error("invalid base58");
    for (let i = bytes.length - 1; i >= 0; i--) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of String(value)) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function parseJSONFromOutput(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeError(err) {
  return String(err?.message || err || "")
    .replaceAll(process.env.CLAWDBOT_TREASURY_PRIVATE_KEY || "__never__", "<secret>")
    .replaceAll(process.env.PRIVATE_KEY || "__never__", "<secret>")
    .slice(0, 1000);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}
