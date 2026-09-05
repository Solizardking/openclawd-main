#!/usr/bin/env node
/**
 * Install-time Pump.fun live tape — same ingest as https://solgpt.us/pump.
 *
 * Frames: token-launch | status | token-enriched (heartbeat ignored).
 * Relay:  wss://clawd-ws.fly.dev/ws  (CLAWDBOT_PUMP_WS override)
 *
 * Never throws to the caller. Time-bounded, skippable, non-fatal on
 * dead/slow relay, parse errors, missing WebSocket, non-TTY, or CI.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_PUMP_WS = "wss://clawd-ws.fly.dev/ws";
export const PUMP_PAGE = "https://solgpt.us/pump";
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_EVENTS = 8;

export const C = {
  green: "\x1b[1;38;2;20;241;149m",
  purple: "\x1b[1;38;2;153;69;255m",
  teal: "\x1b[1;38;2;0;212;255m",
  amber: "\x1b[1;38;2;255;170;0m",
  dim: "\x1b[38;2;85;102;128m",
  white: "\x1b[1;37m",
  reset: "\x1b[0m",
};

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function truthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function paint(enabled, code, text) {
  if (!enabled || text == null || text === "") return text == null ? "" : String(text);
  return `${code}${text}${C.reset}`;
}

export function truncateMint(mint, head = 4, tail = 4) {
  const s = str(mint);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function formatUptime(seconds) {
  const n = num(seconds);
  if (n == null || n < 0) return "";
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(n)}s`;
}

export function formatMarketCap(sol) {
  const n = num(sol);
  if (n == null) return "";
  if (n >= 100) return `${n.toFixed(0)} SOL`;
  if (n >= 10) return `${n.toFixed(1)} SOL`;
  return `${n.toFixed(2)} SOL`;
}

function formatCount(n) {
  const v = num(n);
  if (v == null) return "";
  return Math.round(v).toLocaleString("en-US");
}

function clipName(name, max = 22) {
  const s = str(name).replace(/\s+/g, " ");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Parse a solgpt.us/pump WebSocket frame (string or object) into a
 * tagged record. Returns null for junk / unknown / heartbeat-without-type.
 */
export function parsePumpFrame(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    obj = Buffer.from(raw).toString("utf8");
  }
  if (typeof obj === "string") {
    const t = obj.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;

  const type = str(obj.type || obj.event || obj.kind).toLowerCase().replace(/_/g, "-");

  if (type === "token-launch" || type === "launch") {
    const name = str(obj.name);
    const symbol = str(obj.symbol);
    const mint = str(obj.mint || obj.tokenMint || obj.address);
    if (!name && !symbol && !mint) return null;
    return {
      kind: "token-launch",
      type: "token-launch",
      name,
      symbol,
      mint,
      signature: str(obj.signature),
      time: obj.time ?? null,
      marketCapSol: num(obj.marketCapSol),
      hasGithub: Boolean(obj.hasGithub),
      githubUrls: Array.isArray(obj.githubUrls) ? obj.githubUrls.map(str).filter(Boolean) : [],
      isV2: Boolean(obj.isV2),
      creator: str(obj.creator),
      description: str(obj.description),
      website: str(obj.website),
      twitter: str(obj.twitter),
      telegram: str(obj.telegram),
      raw: obj,
    };
  }

  if (type === "status") {
    return {
      kind: "status",
      type: "status",
      connected: obj.connected,
      uptime: num(obj.uptime),
      totalLaunches: num(obj.totalLaunches),
      githubLaunches: num(obj.githubLaunches),
      totalClaims: num(obj.totalClaims),
      clients: num(obj.clients),
      raw: obj,
    };
  }

  if (type === "token-enriched" || type === "enriched") {
    const name = str(obj.name);
    const symbol = str(obj.symbol);
    const mint = str(obj.mint || obj.tokenMint || obj.address);
    if (!name && !symbol && !mint) return null;
    return {
      kind: "token-enriched",
      type: "token-enriched",
      name,
      symbol,
      mint,
      signature: str(obj.signature),
      marketCapSol: num(obj.marketCapSol),
      hasGithub: Boolean(obj.hasGithub),
      description: str(obj.description),
      raw: obj,
    };
  }

  if (type === "heartbeat") {
    return { kind: "heartbeat", type: "heartbeat", raw: obj };
  }

  return null;
}

export function formatLaunchLine(frame, { color = true } = {}) {
  const f = frame && frame.kind ? frame : parsePumpFrame(frame);
  if (!f || (f.kind !== "token-launch" && f.kind !== "token-enriched")) return "";
  const dollar = f.symbol ? `$${f.symbol}` : "";
  const title = clipName(f.name) || dollar || "unnamed";
  const ticker = dollar && f.name ? dollar : dollar && !f.name ? "" : "";
  const mint = truncateMint(f.mint);
  const mc = formatMarketCap(f.marketCapSol);
  const gh = f.hasGithub ? "gh" : "";
  const arrow = f.kind === "token-enriched" ? "◆" : "▶";
  const parts = [
    paint(color, C.green, arrow),
    ticker ? paint(color, C.purple, ticker) : "",
    paint(color, C.white, title),
    mint ? paint(color, C.dim, mint) : "",
    mc ? paint(color, C.amber, mc) : "",
    gh ? paint(color, C.teal, gh) : "",
  ].filter(Boolean);
  return `    ${parts.join("  ")}`;
}

export function formatStatusLine(frame, { color = true } = {}) {
  const f = frame && frame.kind ? frame : parsePumpFrame(frame);
  if (!f || f.kind !== "status") return "";
  const bits = [];
  const launches = formatCount(f.totalLaunches);
  if (launches) bits.push(`${launches} launches`);
  const gh = formatCount(f.githubLaunches);
  if (gh) bits.push(`${gh} github`);
  const clients = formatCount(f.clients);
  if (clients) bits.push(`${clients} watching`);
  const up = formatUptime(f.uptime);
  if (up) bits.push(`up ${up}`);
  if (bits.length === 0) return "";
  const body = bits.join(" · ");
  return `    ${paint(color, C.teal, "●")} ${paint(color, C.dim, body)}`;
}

export function formatEnrichedLine(frame, opts = {}) {
  return formatLaunchLine(frame, opts);
}

export function formatPumpFrame(frame, opts = {}) {
  const f = frame && frame.kind ? frame : parsePumpFrame(frame);
  if (!f) return "";
  if (f.kind === "token-launch" || f.kind === "token-enriched") return formatLaunchLine(f, opts);
  if (f.kind === "status") return formatStatusLine(f, opts);
  return "";
}

export function formatTapeHeader({ color = true } = {}) {
  const dim = (s) => paint(color, C.dim, s);
  const bar = dim("──────────────────────────────────────────────────────────────");
  const title = `${paint(color, C.green, "CLAWD")} ${dim("·")} ${paint(color, C.green, "PUMP.FUN LIVE")} ${dim("·")} ${paint(color, C.purple, "solgpt.us/pump")}`;
  const hint = dim("live launches  ·  skip: CLAWDBOT_SKIP_PUMP_TAPE=1");
  return [
    `    ${dim("┌")}${bar}${dim("┐")}`,
    `    ${dim("│")}  ${title}`,
    `    ${dim("│")}  ${hint}`,
    `    ${dim("└")}${bar}${dim("┘")}`,
  ].join("\n");
}

export function formatTapeFooter(stats = {}, { color = true } = {}) {
  const launches = Number(stats.launches || 0);
  const reason = str(stats.reason);
  const bits = [`${launches} launch${launches === 1 ? "" : "es"}`];
  if (reason && reason !== "ok") bits.push(reason);
  return `    ${paint(color, C.dim, `· tape closed (${bits.join(" · ")})`)}`;
}

/**
 * Skip unless a TTY (or force / injected source). Explicit skip always wins.
 */
export function shouldSkipPumpTape({
  env = process.env,
  isTTY = process.stdout?.isTTY,
  hasSource = false,
} = {}) {
  if (truthy(env.CLAWDBOT_SKIP_PUMP_TAPE)) return true;
  if (hasSource) return false;
  if (truthy(env.CLAWDBOT_PUMP_TAPE_FORCE)) return false;
  if (truthy(env.CI)) return true;
  if (env.npm_config_loglevel === "silent") return true;
  if (env.NODE_TEST_CONTEXT) return true;
  if (!isTTY) return true;
  return false;
}

function colorEnabled({ env = process.env, isTTY = process.stdout?.isTTY } = {}) {
  if (truthy(env.FORCE_COLOR) || truthy(env.CLAWDBOT_PUMP_TAPE_FORCE)) return true;
  if (truthy(env.NO_COLOR)) return false;
  return Boolean(isTTY);
}

function timeoutMsFrom(env, override) {
  const n = num(override ?? env.CLAWDBOT_PUMP_TAPE_MS);
  if (n != null && n > 0) return Math.min(n, 60_000);
  return DEFAULT_TIMEOUT_MS;
}

function maxEventsFrom(env, override) {
  const n = num(override ?? env.CLAWDBOT_PUMP_TAPE_MAX);
  if (n != null && n > 0) return Math.min(Math.floor(n), 50);
  return DEFAULT_MAX_EVENTS;
}

async function* iterateSource(source) {
  if (source == null) return;
  if (typeof source === "string") {
    yield source;
    return;
  }
  if (typeof source[Symbol.asyncIterator] === "function") {
    yield* source;
    return;
  }
  if (typeof source[Symbol.iterator] === "function") {
    yield* source;
    return;
  }
}

function loadFixture(path) {
  const body = readFileSync(path, "utf8");
  const parsed = JSON.parse(body);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.frames)) return parsed.frames;
  return [parsed];
}

function maskFrame(payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const mask = randomBytes(4);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | data.length;
    mask.copy(header, 2);
  } else {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
    mask.copy(header, 4);
  }
  return Buffer.concat([header, masked]);
}

function parseServerFrames(buf) {
  const out = [];
  let offset = 0;
  while (buf.length - offset >= 2) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let hdr = 2;
    if (len === 126) {
      if (buf.length - offset < 4) break;
      len = buf.readUInt16BE(offset + 2);
      hdr = 4;
    } else if (len === 127) {
      if (buf.length - offset < 10) break;
      const hi = buf.readUInt32BE(offset + 2);
      const lo = buf.readUInt32BE(offset + 6);
      if (hi !== 0) {
        offset = buf.length;
        break;
      }
      len = lo;
      hdr = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length - offset < hdr + maskLen + len) break;
    let payload = buf.subarray(offset + hdr + maskLen, offset + hdr + maskLen + len);
    if (masked) {
      const mask = buf.subarray(offset + hdr, offset + hdr + 4);
      const decoded = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) decoded[i] = payload[i] ^ mask[i % 4];
      payload = decoded;
    }
    offset += hdr + maskLen + len;
    out.push({ opcode, payload });
  }
  return { frames: out, rest: buf.subarray(offset) };
}

function nativeWebSocketMessages(urlStr, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const messages = [];
    const waiters = [];
    const queue = {
      push(msg) {
        if (waiters.length) waiters.shift()({ value: msg, done: false });
        else messages.push(msg);
      },
      end() {
        while (waiters.length) waiters.shift()({ value: undefined, done: true });
      },
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (messages.length) {
            yield messages.shift();
            continue;
          }
          const next = await new Promise((r) => waiters.push(r));
          if (next.done) return;
          yield next.value;
        }
      },
      close() {
        try {
          socket?.end();
          socket?.destroy();
        } catch {
          /* ignore */
        }
        req.destroy();
        queue.end();
      },
    };

    let socket;
    const url = new URL(urlStr);
    const isTls = url.protocol === "wss:";
    const reqFn = isTls ? httpsRequest : httpRequest;
    const key = randomBytes(16).toString("base64");
    const req = reqFn({
      protocol: isTls ? "https:" : "http:",
      hostname: url.hostname,
      port: url.port || (isTls ? 443 : 80),
      path: `${url.pathname || "/"}${url.search}`,
      method: "GET",
      headers: {
        Host: url.host,
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
      },
      timeout: 8_000,
    });

    const fail = (err) => {
      if (settled) return;
      settled = true;
      queue.close();
      reject(err);
    };

    req.on("upgrade", (_res, sock) => {
      socket = sock;
      if (!settled) {
        settled = true;
        resolve(queue);
      }
      let buf = Buffer.alloc(0);
      sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const parsed = parseServerFrames(buf);
        buf = parsed.rest;
        for (const frame of parsed.frames) {
          if (frame.opcode === 0x1) queue.push(frame.payload.toString("utf8"));
          else if (frame.opcode === 0x8) queue.close();
          else if (frame.opcode === 0x9) {
            try {
              sock.write(maskFrame(frame.payload));
            } catch {
              /* ignore */
            }
          }
        }
      });
      sock.on("close", () => queue.end());
      sock.on("error", () => queue.end());
    });
    req.on("error", fail);
    req.on("timeout", () => fail(new Error("websocket handshake timeout")));
    req.on("response", (res) => fail(new Error(`websocket upgrade failed (${res.statusCode})`)));
    if (signal) {
      const onAbort = () => queue.close();
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    req.end();
  });
}

async function* websocketMessages(urlStr, { signal } = {}) {
  const WS = globalThis.WebSocket;
  if (typeof WS === "function") {
    const ws = new WS(urlStr);
    const messages = [];
    const waiters = [];
    let closed = false;
    const push = (msg) => {
      if (waiters.length) waiters.shift()({ value: msg, done: false });
      else messages.push(msg);
    };
    const end = () => {
      closed = true;
      while (waiters.length) waiters.shift()({ value: undefined, done: true });
    };
    ws.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : ev.data?.toString?.() || "";
      push(data);
    });
    ws.addEventListener("close", end);
    ws.addEventListener("error", end);
    if (signal) {
      const onAbort = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        end();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      while (!closed) {
        if (messages.length) {
          yield messages.shift();
          continue;
        }
        const next = await new Promise((r) => waiters.push(r));
        if (next.done) return;
        yield next.value;
      }
    } finally {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    return;
  }
  const queue = await nativeWebSocketMessages(urlStr, { signal });
  try {
    yield* queue;
  } finally {
    queue.close();
  }
}

function writeln(out, line) {
  if (!line) return;
  out.write(line.endsWith("\n") ? line : `${line}\n`);
}

/**
 * Bounded tape renderer. `source` may be an array/async iterable of raw
 * frames (tests); otherwise connects to CLAWDBOT_PUMP_WS / DEFAULT_PUMP_WS.
 */
export async function runPumpTape(options = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const isTTY = options.isTTY ?? stdout.isTTY;
  const color = options.color ?? colorEnabled({ env, isTTY });
  const source = options.source;
  const fixturePath = options.fixturePath || env.CLAWDBOT_PUMP_TAPE_FIXTURE || "";
  const hasSource = Boolean(source) || Boolean(fixturePath);
  const timeoutMs = timeoutMsFrom(env, options.timeoutMs);
  const maxEvents = maxEventsFrom(env, options.maxEvents);
  const url = str(options.url || env.CLAWDBOT_PUMP_WS) || DEFAULT_PUMP_WS;

  if (shouldSkipPumpTape({ env, isTTY, hasSource })) {
    return { skipped: true, reason: "skip", launches: 0, lines: [] };
  }

  const lines = [];
  const emit = (line) => {
    if (!line) return;
    lines.push(line);
    writeln(stdout, line);
  };

  emit(formatTapeHeader({ color }));

  let launches = 0;
  let statusSeen = false;
  let reason = "ok";
  const ac = new AbortController();
  const timer = setTimeout(() => {
    reason = reason === "ok" ? "timeout" : reason;
    ac.abort();
  }, timeoutMs);

  const countsTowardCap = (kind) => kind === "token-launch" || kind === "token-enriched";

  try {
    let frames;
    if (source) frames = iterateSource(source);
    else if (fixturePath) frames = iterateSource(loadFixture(fixturePath));
    else frames = websocketMessages(url, { signal: ac.signal });

    for await (const raw of frames) {
      if (ac.signal.aborted) break;
      let parsed;
      try {
        parsed = parsePumpFrame(raw);
      } catch {
        continue;
      }
      if (!parsed) continue;
      const line = formatPumpFrame(parsed, { color });
      if (!line) continue;
      if (parsed.kind === "status") {
        emit(line);
        statusSeen = true;
        continue;
      }
      emit(line);
      if (countsTowardCap(parsed.kind)) {
        launches += 1;
        if (launches >= maxEvents) {
          reason = "max-events";
          break;
        }
      }
    }
  } catch (err) {
    reason = "relay-miss";
    const miss = `    ${paint(color, C.dim, `· pump tape skipped (${str(err?.message || err) || "relay unavailable"})`)}`;
    emit(miss);
  } finally {
    clearTimeout(timer);
    try {
      ac.abort();
    } catch {
      /* ignore */
    }
  }

  emit(formatTapeFooter({ launches, reason }, { color }));
  emit(`    ${paint(color, C.dim, PUMP_PAGE)}`);
  writeln(stdout, "");

  return {
    skipped: false,
    ok: true,
    reason,
    launches,
    statusSeen,
    lines,
    url,
  };
}

/**
 * Sync install hook. spawnSync the CLI so `runOneshot` stays sync.
 * Never throws; never fails the install.
 */
export function playInstallPumpTape(options = {}) {
  try {
    const env = options.env || process.env;
    const hasSource = Boolean(
      options.source || options.fixturePath || env.CLAWDBOT_PUMP_TAPE_FIXTURE,
    );
    if (
      shouldSkipPumpTape({
        env,
        isTTY: options.isTTY ?? process.stdout?.isTTY,
        hasSource,
      })
    ) {
      return { skipped: true, reason: "skip" };
    }
    const tape = options.scriptPath || join(__dirname, "pump-tape.mjs");
    if (!existsSync(tape)) return { skipped: true, reason: "missing" };
    const childEnv = { ...process.env, ...env };
    if (options.fixturePath) childEnv.CLAWDBOT_PUMP_TAPE_FIXTURE = options.fixturePath;
    if (options.url) childEnv.CLAWDBOT_PUMP_WS = options.url;
    const timeoutMs = timeoutMsFrom(childEnv, options.timeoutMs);
    const r = spawnSync(process.execPath, [tape], {
      stdio: options.stdio || "inherit",
      env: childEnv,
      timeout: timeoutMs + 4_000,
    });
    return {
      skipped: false,
      ok: r.status === 0 || r.status === null,
      status: r.status,
      error: r.error ? String(r.error.message || r.error) : "",
    };
  } catch (err) {
    try {
      const msg = str(err?.message || err);
      if (msg) process.stderr.write(`  ⚠ pump tape skipped (${msg})\n`);
    } catch {
      /* ignore */
    }
    return { skipped: false, ok: false, error: String(err?.message || err) };
  }
}

// curl|bash fetches this file into $TMPDIR (/var/folders → /private/var on
// macOS). path.resolve() does not follow that symlink, so compare realpaths
// or the CLI never runs after a remote install.
function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(entry) === fileURLToPath(import.meta.url);
  }
}

if (isCliEntry()) {
  runPumpTape()
    .then((result) => {
      if (result?.skipped) process.exit(0);
      process.exit(0);
    })
    .catch(() => {
      process.exit(0);
    });
}
