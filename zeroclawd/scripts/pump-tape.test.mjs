import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runOneshot } from "./oneshot-install.mjs";
import {
  DEFAULT_PUMP_WS,
  PUMP_PAGE,
  formatEnrichedLine,
  formatLaunchLine,
  formatPumpFrame,
  formatStatusLine,
  formatTapeHeader,
  parsePumpFrame,
  playInstallPumpTape,
  runPumpTape,
  shouldSkipPumpTape,
  truncateMint,
} from "./pump-tape.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "scripts", "pump-tape.fixture.json");
const tapeScript = join(root, "scripts", "pump-tape.mjs");
const FIXTURES = JSON.parse(readFileSync(fixturePath, "utf8"));
const launchRaw = FIXTURES.find((f) => f.type === "token-launch");
const statusRaw = FIXTURES.find((f) => f.type === "status");
const enrichedRaw = FIXTURES.find((f) => f.type === "token-enriched");

function collect(fn) {
  const chunks = [];
  const stdout = {
    isTTY: false,
    write(s) {
      chunks.push(String(s));
      return true;
    },
  };
  return { stdout, text: () => chunks.join("") };
}

test("parsePumpFrame maps token-launch / status / token-enriched fields", () => {
  const launch = parsePumpFrame(JSON.stringify(launchRaw));
  assert.equal(launch.kind, "token-launch");
  assert.equal(launch.name, "PepeFrog");
  assert.equal(launch.symbol, "FROG");
  assert.equal(launch.mint, launchRaw.mint);
  assert.equal(launch.signature, launchRaw.signature);
  assert.equal(launch.marketCapSol, 12.4);
  assert.equal(launch.hasGithub, true);

  const status = parsePumpFrame(statusRaw);
  assert.equal(status.kind, "status");
  assert.equal(status.totalLaunches, 2937323);
  assert.equal(status.clients, 6);
  assert.equal(status.uptime, 8452440);

  const enriched = parsePumpFrame(enrichedRaw);
  assert.equal(enriched.kind, "token-enriched");
  assert.equal(enriched.symbol, "CAT");
  assert.equal(enriched.mint, enrichedRaw.mint);

  assert.equal(parsePumpFrame("not-json"), null);
  assert.equal(parsePumpFrame({ type: "heartbeat" }).kind, "heartbeat");
  assert.equal(parsePumpFrame({ type: "token-launch" }), null);
});

test("formatPumpFrame is a styled tape, not a raw JSON dump", () => {
  const launchLine = formatLaunchLine(launchRaw, { color: true });
  assert.match(launchLine, /PepeFrog|FROG/);
  assert.match(launchLine, /7xK9/);
  assert.match(launchLine, /\x1b\[/);
  assert.notEqual(launchLine, JSON.stringify(launchRaw));
  assert.ok(!launchLine.includes('"type":"token-launch"'));

  const statusLine = formatStatusLine(statusRaw, { color: true });
  assert.match(statusLine, /2,937,323|2937323/);
  assert.match(statusLine, /6/);
  assert.match(statusLine, /97d/);
  assert.notEqual(statusLine, JSON.stringify(statusRaw));

  const enrichedLine = formatEnrichedLine(enrichedRaw, { color: true });
  assert.match(enrichedLine, /CatWifHat|CAT/);
  assert.match(enrichedLine, /9Enr/);
  assert.notEqual(enrichedLine, JSON.stringify(enrichedRaw));

  assert.equal(formatPumpFrame({ type: "heartbeat" }), "");
  const header = formatTapeHeader({ color: false });
  assert.match(header, /CLAWD/);
  assert.match(header, /PUMP\.FUN LIVE/);
  assert.match(header, /solgpt\.us\/pump/);
  assert.doesNotMatch(header, /mawdbot/i);
  assert.equal(truncateMint(launchRaw.mint).includes("…"), true);
});

test("shouldSkipPumpTape honors skip / CI / TTY / force / injected source", () => {
  assert.equal(shouldSkipPumpTape({ env: { CLAWDBOT_SKIP_PUMP_TAPE: "1" }, isTTY: true }), true);
  assert.equal(shouldSkipPumpTape({ env: { CI: "true" }, isTTY: true }), true);
  assert.equal(shouldSkipPumpTape({ env: { npm_config_loglevel: "silent" }, isTTY: true }), true);
  assert.equal(shouldSkipPumpTape({ env: {}, isTTY: false }), true);
  assert.equal(
    shouldSkipPumpTape({ env: { CLAWDBOT_PUMP_TAPE_FORCE: "1" }, isTTY: false }),
    false,
  );
  assert.equal(shouldSkipPumpTape({ env: { CI: "1" }, isTTY: false, hasSource: true }), false);
  assert.equal(
    shouldSkipPumpTape({
      env: { CLAWDBOT_SKIP_PUMP_TAPE: "1" },
      isTTY: true,
      hasSource: true,
    }),
    true,
  );
});

test("runOneshot still succeeds when the pump tape is skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbot-pump-skip-"));
  const prev = process.env.CLAWDBOT_SKIP_PUMP_TAPE;
  process.env.CLAWDBOT_SKIP_PUMP_TAPE = "1";
  try {
    const receipt = runOneshot({
      dir,
      skipGo: true,
      skipBirth: true,
      skipAutomaton: true,
      force: true,
    });
    assert.equal(receipt.installDir, dir);
    assert.ok(receipt.skillCount >= 20);
    assert.ok(existsSync(join(dir, "oneshot-receipt.json")));
    const played = playInstallPumpTape({
      env: { ...process.env, CLAWDBOT_SKIP_PUMP_TAPE: "1" },
      isTTY: true,
    });
    assert.equal(played.skipped, true);
  } finally {
    if (prev === undefined) delete process.env.CLAWDBOT_SKIP_PUMP_TAPE;
    else process.env.CLAWDBOT_SKIP_PUMP_TAPE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runPumpTape with injected fixture prints styled launch lines (twice)", async () => {
  assert.equal(DEFAULT_PUMP_WS, "wss://clawd-ws.fly.dev/ws");
  assert.equal(PUMP_PAGE, "https://solgpt.us/pump");

  for (const run of [1, 2]) {
    const io = collect();
    const result = await runPumpTape({
      source: FIXTURES,
      stdout: io.stdout,
      stderr: io.stdout,
      isTTY: false,
      color: true,
      env: { CLAWDBOT_PUMP_TAPE_FORCE: "1" },
    });
    assert.equal(result.skipped, false, `run ${run} skipped`);
    assert.ok(result.launches >= 1, `run ${run} launches=${result.launches}`);
    const text = io.text();
    assert.match(text, /PepeFrog|FROG/);
    assert.match(text, /7xK9|pump/);
    assert.match(text, /2,937,323|2937323/);
    assert.match(text, /CatWifHat|CAT/);
    assert.match(text, /\x1b\[/);
    assert.ok(!text.includes(JSON.stringify(launchRaw)));
    assert.match(text, /solgpt\.us\/pump/);
  }
});

test("install-time tape CLI against fixture exits 0 twice", () => {
  for (const run of [1, 2]) {
    const r = spawnSync(process.execPath, [tapeScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWDBOT_PUMP_TAPE_FIXTURE: fixturePath,
        CLAWDBOT_PUMP_TAPE_FORCE: "1",
        CLAWDBOT_SKIP_PUMP_TAPE: "",
        CI: "",
        NO_COLOR: "",
        FORCE_COLOR: "1",
        NODE_TEST_CONTEXT: "",
      },
    });
    assert.equal(r.status, 0, `run ${run} status=${r.status} stderr=${r.stderr}`);
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    assert.match(out, /CLAWD/);
    assert.match(out, /PepeFrog|FROG/);
    assert.match(out, /7xK9|pump/);
    assert.match(out, /\x1b\[/);
    assert.doesNotMatch(out, /mawdbot/i);
  }
});

test("tape CLI still runs after copy into TMPDIR (curl|bash fetch path)", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbot-tape-copy-"));
  // Matches install.sh: mktemp -d ...XXXXXX then write pump-tape.mjs inside.
  const copied = join(dir, "pump-tape.mjs");
  try {
    copyFileSync(tapeScript, copied);
    const r = spawnSync(process.execPath, [copied], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWDBOT_PUMP_TAPE_FIXTURE: fixturePath,
        CLAWDBOT_PUMP_TAPE_FORCE: "1",
        CLAWDBOT_SKIP_PUMP_TAPE: "",
        CI: "",
        NO_COLOR: "",
        FORCE_COLOR: "1",
        NODE_TEST_CONTEXT: "",
      },
    });
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    assert.match(out, /CLAWD/);
    assert.match(out, /PepeFrog|FROG/);
    assert.match(out, /7xK9|pump/);
    assert.match(out, /\x1b\[/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install.sh mktemp template keeps XXXXXX at the end (BSD-safe)", () => {
  const template = join(tmpdir(), "clawdbot-pump-tape.XXXXXX");
  const r = spawnSync("mktemp", ["-d", template], { encoding: "utf8" });
  assert.equal(r.status, 0, `mktemp -d failed: ${r.stderr}`);
  const created = (r.stdout || "").trim();
  assert.ok(created && existsSync(created), `missing dir: ${created}`);
  rmSync(created, { recursive: true, force: true });
});

test("install.sh curl|bash path HTTP-fetches tape into mktemp when REPO_DIR is empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbot-install-tape-"));
  const isolatedInstall = join(dir, "install.sh");
  const body = readFileSync(tapeScript);
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": String(body.length),
    });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/pump-tape.mjs`;
  try {
    copyFileSync(join(root, "install.sh"), isolatedInstall);
    // spawn (not spawnSync): curl must be served on this event loop.
    const r = await new Promise((resolve, reject) => {
      const child = spawn("bash", [isolatedInstall], {
        env: {
          ...process.env,
          CLAWDBOT_PUMP_TAPE_ONLY: "1",
          CLAWDBOT_PUMP_TAPE_URL: url,
          CLAWDBOT_PUMP_TAPE_FIXTURE: fixturePath,
          CLAWDBOT_PUMP_TAPE_FORCE: "1",
          CLAWDBOT_SKIP_PUMP_TAPE: "",
          CLAWDBOT_INSTALL_DIR: join(dir, "install-home"),
          REPO_DIR: "",
          LOCAL_SOURCE_DIR: "",
          CI: "",
          NO_COLOR: "",
          FORCE_COLOR: "1",
          NODE_TEST_CONTEXT: "",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    assert.equal(r.status, 0, `status=${r.status} stderr=${r.stderr}`);
    assert.ok(hits >= 1, `expected HTTP fetch into mktemp, hits=${hits}`);
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    assert.match(out, /CLAWD/);
    assert.match(out, /PepeFrog|FROG/);
    assert.match(out, /7xK9|pump/);
    assert.match(out, /\x1b\[/);
    assert.ok(!out.includes(JSON.stringify(launchRaw)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
