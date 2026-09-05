#!/usr/bin/env node
/**
 * Clawd Bot computer desk — HTTP surface that proves oneshot is ready.
 * GET is public. POST /exec requires X-Clawd-Token when CLAWDBOT_COMPUTER_TOKEN is set.
 */
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.CLAWDBOT_COMPUTER_PORT || 8787);
const NPM_SPEC = process.env.CLAWDBOT_NPM_SPEC || "clawdbot-go@latest";
const SKILLS_DIR = process.env.CLAWDBOT_SKILLS_DIR || join(homedir(), ".clawdbot/skills");
const TOKEN = (process.env.CLAWDBOT_COMPUTER_TOKEN || "").trim();
const READY_DIR = join(homedir(), ".clawdbot-computer");
const READY_FILE = join(READY_DIR, "ready.json");
const STARTED = Date.now();

const PRESETS = {
  help: { bin: "npx", args: ["--yes", NPM_SPEC, "help"] },
  skills: { bin: "npx", args: ["--yes", NPM_SPEC, "skills"] },
  inspect: { bin: "npx", args: ["--yes", NPM_SPEC, "inspect"] },
  "skills-dir": { bin: "npx", args: ["--yes", NPM_SPEC, "skills-dir"] },
  oneshot: { bin: "bash", args: [join(homedir(), "clawdbot-computer/oneshot.sh")] },
  bins: { bin: "bash", args: ["-lc", "command -v clawdbot-go; command -v clawd-bot; command -v npx; npx --yes " + NPM_SPEC + " help"] },
};

function tokenOk(header) {
  if (!TOKEN) return true;
  const got = String(header || "");
  const a = Buffer.from(TOKEN);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function skillCount() {
  try {
    if (!existsSync(SKILLS_DIR)) return 0;
    return readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).length;
  } catch {
    return 0;
  }
}

function snapshot() {
  return {
    ok: true,
    product: "Clawd Bot",
    package: "clawdbot-go",
    npmSpec: NPM_SPEC,
    skillsDir: SKILLS_DIR,
    skillCount: skillCount(),
    prepackaged: existsSync(join(SKILLS_DIR, ".clawdbot-prepackaged.json")),
    uptimeMs: Date.now() - STARTED,
    port: PORT,
    presets: Object.keys(PRESETS),
  };
}

function writeReady() {
  mkdirSync(READY_DIR, { recursive: true });
  writeFileSync(READY_FILE, JSON.stringify({ ...snapshot(), readyAt: new Date().toISOString() }, null, 2));
}

function htmlPage() {
  const snap = snapshot();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Clawd Bot Computer</title>
<style>
  :root{--neon:#14F195;--purple:#9945FF;--teal:#00d4ff;--ink:#c8d8e8;--dim:#5a6a80;--bg:#05050c}
  *{box-sizing:border-box} html,body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  body{min-height:100vh;padding:28px 22px;background-image:linear-gradient(rgba(20,241,149,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(153,69,255,.04) 1px,transparent 1px);background-size:42px 42px}
  .mark{font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:var(--neon)}
  h1{font-size:28px;margin:8px 0 6px;color:#fff;letter-spacing:.04em}
  .sub{color:var(--dim);font-size:13px;max-width:52ch;line-height:1.5}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:22px 0}
  .cell{border:1px solid #1c1c32;background:#0a0a14;padding:12px 14px}
  .cell b{display:block;color:var(--teal);font-size:18px}
  .cell span{color:var(--dim);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  pre{background:#080812;border:1px solid #1c1c32;padding:14px;overflow:auto;color:var(--neon);font-size:12px}
  a{color:var(--teal)}
</style>
</head>
<body>
  <div class="mark">E2B · CLAWD BOT COMPUTER</div>
  <h1>oneshot ready</h1>
  <p class="sub">This sandbox baked <code>npx clawdbot-go</code>. Skills live in ${snap.skillsDir}. Desk port ${snap.port}.</p>
  <div class="grid">
    <div class="cell"><b>${snap.skillCount}</b><span>skills</span></div>
    <div class="cell"><b>${snap.prepackaged ? "yes" : "no"}</b><span>prepackaged</span></div>
    <div class="cell"><b>${Math.floor(snap.uptimeMs / 1000)}s</b><span>uptime</span></div>
    <div class="cell"><b>8787</b><span>desk port</span></div>
  </div>
  <pre>npx clawdbot-go skills
npx clawdbot-go inspect
npx clawdbot-go skills-install --force
curl -fsS http://127.0.0.1:${snap.port}/health</pre>
</body>
</html>`;
}

async function runPreset(name) {
  const spec = PRESETS[name];
  if (!spec) {
    const err = new Error("unknown preset");
    err.status = 400;
    throw err;
  }
  try {
    const { stdout, stderr } = await execFileAsync(spec.bin, spec.args, {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
      cwd: homedir(),
    });
    return { ok: true, preset: name, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    return {
      ok: false,
      preset: name,
      stdout: e.stdout || "",
      stderr: e.stderr || String(e.message || e),
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 1 << 20) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json") {
  const raw = type === "application/json" ? JSON.stringify(body, null, 2) : String(body);
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
    "x-clawd-computer": "clawdbot-go",
  });
  res.end(raw);
}

writeReady();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && (path === "/health" || path === "/ready")) {
    send(res, 200, { status: "ok", agent: "Clawd Bot", package: "clawdbot-go" });
    return;
  }
  if (req.method === "GET" && (path === "/status.json" || path === "/status")) {
    send(res, 200, snapshot());
    return;
  }
  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    send(res, 200, htmlPage(), "text/html");
    return;
  }
  if (req.method === "POST" && path === "/exec") {
    if (!tokenOk(req.headers["x-clawd-token"])) {
      send(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    try {
      const body = await readJSON(req);
      const preset = String(body.preset || "").trim();
      const out = await runPreset(preset);
      send(res, out.ok ? 200 : 422, out);
    } catch (e) {
      send(res, e.status || 400, { ok: false, error: "invalid exec payload" });
    }
    return;
  }
  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  writeReady();
  process.stdout.write(`clawdbot computer listening on :${PORT}\n`);
});
