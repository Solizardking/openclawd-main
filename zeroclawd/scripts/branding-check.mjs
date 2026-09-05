/**
 * Public branding regression checks for the Clawd Bot open-source release.
 * Asserts product surfaces and user-facing chrome — not the technical clawdbot* aliases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("install-npm product line includes zeroclawd + agent hub", () => {
  const src = read("install-npm.sh");
  assert.match(src, /cheshireterminal\.ai\/zeroclawd/);
  assert.match(src, /cheshireterminal\.ai\/agents/);
  assert.match(src, /\/agents\/forge/);
  assert.match(src, /funpump\.ai/);
  assert.match(src, /Connect from Cheshire Terminal/);
  assert.match(src, /CLAWDBOT_CORS_ORIGINS=https:\/\/cheshireterminal\.ai/);
  assert.match(src, /127\.0\.0\.1:18800/);
  assert.match(src, /local install\.sh/);
});

test("install.sh DNA and env use Clawd Bot product name", () => {
  const src = read("install.sh");
  assert.match(src, /--agent-name "Clawd Bot"/);
  assert.match(src, /Clawd Bot Environment/);
  assert.doesNotMatch(src, /--agent-name "ClawdBot"/);
  assert.doesNotMatch(src, /# ClawdBot Environment/);
  assert.match(src, /ZERO_CLAWD_URL/);
  assert.match(src, /Connect from Cheshire Terminal/);
  assert.match(src, /CLAWDBOT_CORS_ORIGINS=https:\/\/cheshireterminal\.ai/);
  assert.match(src, /cheshireterminal\.ai\/zeroclawd/);
});

test("web and UI chrome titles are Clawd Bot", () => {
  assert.match(read("web/frontend/index.html"), /<title>Clawd Bot — Console<\/title>/);
  assert.match(read("ui/index.html"), /<title>Clawd Bot Control<\/title>/);
  assert.match(read("web/frontend/src/App.tsx"), /Clawd Bot ops console online/);
  assert.match(read("web/backend/main.go"), /Clawd Bot Web Console/);
  const backend = read("pkg/webconsole/server.go");
  assert.match(backend, /Clawd Bot — Web Console/);
  assert.match(backend, /title>Clawd Bot — Console</);
  assert.match(backend, /h1>🦞 Clawd Bot</);
  assert.match(backend, /"agent":\s+"Clawd Bot"/);
  assert.match(backend, /AgentName:\s+"Clawd Bot"/);
  assert.doesNotMatch(backend, /ClawdBot OS/);
});

test("CLI DNA default agent-name is Clawd Bot", () => {
  const main = read("cmd/clawdbot/main.go");
  assert.match(main, /agent-name", "Clawd Bot"/);
});

test("constants AppName is Clawd Bot", () => {
  assert.match(read("pkg/constants/constants.go"), /AppName\s+=\s+"Clawd Bot"/);
});

test("pkg user-facing doctor/birth strings are Clawd Bot", () => {
  assert.match(read("pkg/doctor/doctor.go"), /Clawd Bot doctor report/);
  assert.match(read("pkg/skills/birth.go"), /Clawd Bot birth skill seed/);
  assert.doesNotMatch(read("pkg/doctor/doctor.go"), /ClawdBot doctor report/);
  assert.doesNotMatch(read("pkg/skills/birth.go"), /ClawdBot birth skill seed/);
});

test("ooda / skills / spinners product framing", () => {
  assert.match(read("ooda/README.md"), /Clawd Bot/);
  assert.match(read("ooda/CLAWD.md"), /Clawd Bot — per-tick prompt/);
  assert.match(read("ooda/package.json"), /Clawd Bot OODA/);
  assert.match(read("skills/pack-index.json"), /Clawd Bot \(clawdbot-go\)/);
  assert.match(read("skills/pack-index.json"), /zeroclawd/);
  assert.match(read("spinners/README.md"), /Clawd Bot Spinners/);
});

test("scripts postinstall and box surface say Clawd Bot", () => {
  const post = read("scripts/postinstall.mjs");
  assert.match(post, /Clawd/);
  assert.match(post, /cheshireterminal\.ai\/zeroclawd/);
  assert.match(read("scripts/upstash-box-server.mjs"), /Clawd Bot Box install surface/);
  assert.match(read("scripts/upstash-box-bootstrap.mjs"), /Clawd Bot Box install API/);
});

test("npm package stays clawdbot-go with clawd / clawdbot bins", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "clawdbot-go");
  assert.equal(pkg.bin.clawd, "bin/clawdbot-go.js");
  assert.equal(pkg.bin.clawdbot, "bin/clawdbot-go.js");
  assert.equal(pkg.bin["clawd-bot"], "bin/clawdbot-go.js");
  assert.equal(pkg.bin["clawdbot-go"], "bin/clawdbot-go.js");
  assert.equal(pkg.bin["zero-clawd"], "bin/clawdbot-go.js");
  assert.equal(pkg.bin["clawdbot-stack"], "bin/clawdbot-go.js");
  assert.match(pkg.description, /Clawd Bot/);
  assert.doesNotMatch(pkg.description, /Zero Clawd/);
  assert.ok(pkg.keywords.includes("clawd-bot"));
  assert.ok(pkg.keywords.includes("clawd"));
});

test("user-facing chrome has no leftover Zero Clawd product title", () => {
  const files = [
    "pkg/constants/constants.go",
    "cmd/clawdbot/main.go",
    "install.sh",
    "install-npm.sh",
    "scripts/postinstall.mjs",
    "scripts/oneshot-install.mjs",
    "web/frontend/index.html",
    "web/frontend/src/App.tsx",
    "ui/index.html",
    "README.md",
    "docs/OPEN_SOURCE_RELEASE.md",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /Zero Clawd/, `${rel} still says Zero Clawd`);
    assert.doesNotMatch(src, /ZERO CLAWD/, `${rel} still says ZERO CLAWD`);
  }
});

test("install chrome is Clawd — no leftover Mawd ASCII or ClawdBot product title", () => {
  const files = [
    "README.md",
    "install.sh",
    "install-npm.sh",
    "scripts/oneshot-install.mjs",
    "scripts/postinstall.mjs",
    "scripts/launch.mjs",
    "scripts/pump-tape.mjs",
    "cmd/clawdbot/main.go",
    "cloudflare/README.md",
  ];
  const mawdLetter = "███╗   ███╗ █████╗ ██╗    ██╗██████╗";
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /mawdbot/i, `${rel} still mentions mawdbot`);
    assert.ok(!src.includes(mawdLetter), `${rel} still has Mawd ASCII banner`);
  }
  const readme = read("README.md");
  assert.doesNotMatch(readme, /ClawdBot/);
  assert.match(readme, /npm i -g clawd-go/);
  assert.match(readme, /clawdbot install/);
  assert.match(read("install.sh"), /Clawd — Sovereign Solana/);
  assert.match(read("install-npm.sh"), /Clawd — npm one-shot/);
  assert.match(read("scripts/oneshot-install.mjs"), /Clawd — one-shot stack/);
  assert.match(read("scripts/pump-tape.mjs"), /CLAWD/);
  assert.match(read("cmd/clawdbot/main.go"), /Clawd — Sovereign Solana/);
});
