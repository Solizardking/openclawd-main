/**
 * Prove user skill upload path: public draft validation, authenticated save,
 * and schema table name. Does not require a live database.
 *
 * Run: pnpm exec tsx skills-store/scripts/user-skills-upload.test.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanDraftFiles } from "../../server/lib/skillScanner.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// --- Scanner accepts a well-formed draft (same function save() uses) ---
const goodSkillMd = `---
name: demo-upload-skill
description: Demo skill used by automated upload tests. Trigger when testing skill lab.
---

# Demo upload skill

Instructions for agents.
`;

const scan = scanDraftFiles(
  "demo-upload-skill",
  "demo-upload-skill",
  "Demo skill used by automated upload tests.",
  [{ path: "SKILL.md", content: goodSkillMd }],
);
if (!scan.risk || !["pass", "review", "required"].includes(scan.risk.status)) {
  throw new Error(`unexpected risk status: ${JSON.stringify(scan.risk)}`);
}
if (scan.risk.status === "required") {
  throw new Error(`clean demo skill should not be blocked: ${JSON.stringify(scan.findings)}`);
}

// --- Route module ships save + user-skills endpoints ---
const routeSrc = readFileSync(join(repoRoot, "server/routes/skill-scanner.ts"), "utf8");
for (const needle of [
  'router.post("/save"',
  'router.post("/validate"',
  'router.post("/generate"',
  'router.get("/user-skills"',
  "user_skills",
  "upsertUserSkillRow",
  "USER_SKILLS_ROOT",
]) {
  if (!routeSrc.includes(needle)) {
    throw new Error(`skill-scanner route missing: ${needle}`);
  }
}

// --- Only bounded, non-persisting validation is public; persistence is gated ---
const routesTs = readFileSync(join(repoRoot, "server/routes.ts"), "utf8");
if (!routesTs.includes("isPublicSkillScannerValidationPath")) {
  throw new Error("routes.ts must expose the bounded public validation predicate");
}
if (!routeSrc.includes('router.post("/save", requireSkillSaveAccess')) {
  throw new Error("skill save must require an authenticated or scoped principal");
}
if (!routeSrc.includes('path === "/api/skill-scanner/validate"') || !routeSrc.includes('method.toUpperCase() === "POST"')) {
  throw new Error("public scanner access must be limited to POST /validate");
}

// --- Schema tables exist in both schema sources ---
const sharedSchema = readFileSync(join(repoRoot, "shared/schema.ts"), "utf8");
const drizzleSchema = readFileSync(join(repoRoot, "drizzle/schema.ts"), "utf8");
if (!sharedSchema.includes('pgTable("user_skills"') || !drizzleSchema.includes('pgTable("user_skills"')) {
  throw new Error("user_skills table missing from schema sources");
}
const migration = join(repoRoot, "drizzle/0016_user_skills.sql");
if (!existsSync(migration)) {
  throw new Error("missing drizzle migration 0016_user_skills.sql");
}

// --- Client lab + catalog surfaces ---
const lab = readFileSync(join(repoRoot, "client/src/pages/SkillLabPage.tsx"), "utf8");
if (!lab.includes("/api/skill-scanner/save") || !lab.includes("/api/skill-scanner/user-skills")) {
  throw new Error("SkillLabPage must call save + list user-skills APIs");
}
if (!lab.includes("database")) {
  throw new Error("SkillLabPage should surface database save status");
}
const skillsPage = readFileSync(join(repoRoot, "client/src/pages/SkillsPage.tsx"), "utf8");
if (!skillsPage.includes("/skills/lab") || !skillsPage.includes("user-upload")) {
  throw new Error("SkillsPage must link to lab and recognize user-upload source");
}
const sitemap = readFileSync(join(repoRoot, "client/public/sitemap.xml"), "utf8");
for (const path of ["/skills/lab", "/skills/scanner", "/skills-store"]) {
  if (!sitemap.includes(path)) throw new Error(`sitemap missing ${path}`);
}

// --- Integrated skills hub still present for client catalog ---
if (!existsSync(join(repoRoot, "skills/catalog.json"))) {
  throw new Error("skills/catalog.json missing — hub not integrated");
}
const catalog = JSON.parse(readFileSync(join(repoRoot, "skills/catalog.json"), "utf8"));
if (!Array.isArray(catalog) || catalog.length < 200) {
  throw new Error(`catalog too small: ${Array.isArray(catalog) ? catalog.length : typeof catalog}`);
}

const out = {
  ok: true,
  scanRisk: scan.risk,
  findings: scan.findings.length,
  catalogEntries: catalog.length,
  migration: "0016_user_skills.sql",
};
console.log(JSON.stringify(out, null, 2));
console.log("user-skills-upload.test.ts: ALL PASSED");
