import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectPack, listSkillIds, SKILLS_DIR } from "./skill-pack.mjs";
import { runOneshot } from "./oneshot-install.mjs";

test("skill pack is complete on disk", () => {
  const report = inspectPack();
  assert.equal(report.ok, true, `missing: ${report.missing.join(", ")}`);
  assert.ok(report.skillCount >= 20, `skillCount ${report.skillCount}`);
  assert.ok(existsSync(SKILLS_DIR));
  assert.ok(listSkillIds().includes("cheshire-omni-mint"));
  assert.ok(listSkillIds().includes("rh-launchpad-v3"));
  assert.equal(report.agentsNpm, "https://www.npmjs.com/package/cheshire-terminal-agents");
  assert.equal(report.agentsRepo, "https://github.com/Solizardking/Cheshire-Terminal-Agents");
  assert.equal(report.skillHubRepo, "https://github.com/Solizardking/skillhub-main");
  assert.equal(report.agentHub, "https://cheshireterminal.ai/agents");
  assert.equal(report.zeroClawdHost, "https://cheshireterminal.ai/zeroclawd");
  assert.equal(report.forgeHost, "https://cheshireterminal.ai/agents/forge");
});

test("oneshot installs skills + env into a temp home", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbot-oneshot-"));
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
    assert.ok(existsSync(join(dir, "skills", "pack-index.json")));
    assert.ok(existsSync(join(dir, "skills", "cheshire-omni-mint", "SKILL.md")));
    assert.ok(existsSync(join(dir, ".env")));
    assert.ok(existsSync(join(dir, "oneshot-receipt.json")));
    assert.equal(receipt.agentsNpm, "https://www.npmjs.com/package/cheshire-terminal-agents");
    assert.equal(receipt.agentsRepo, "https://github.com/Solizardking/Cheshire-Terminal-Agents");
    assert.equal(receipt.skillHubRepo, "https://github.com/Solizardking/skillhub-main");
    assert.equal(receipt.agentHub, "https://cheshireterminal.ai/agents");
    assert.equal(receipt.zeroClawdHost, "https://cheshireterminal.ai/zeroclawd");
    const env = readFileSync(join(dir, ".env"), "utf8");
    assert.match(env, /CLAWDBOT_SKILLS_DIR=/);
    assert.match(env, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const diskReceipt = JSON.parse(readFileSync(join(dir, "oneshot-receipt.json"), "utf8"));
    assert.equal(diskReceipt.agentsNpm, receipt.agentsNpm);
    assert.equal(diskReceipt.zeroClawdHost, receipt.zeroClawdHost);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
