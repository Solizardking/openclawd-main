/**
 * Prove skill hub integration into cheshire-terminal/skills:
 * - skills hub root (catalog, docs, bin/scripts)
 * - skillhub-main skill packages (agent-browser, durable-objects, etc.)
 * Drives real on-disk artifacts + the regenerated imported-skills index —
 * not a reimplementation of catalog builders.
 *
 * Run: pnpm exec tsx skills-store/scripts/hub-skills-integration.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = join(repoRoot, "skills");
const importedPath = join(repoRoot, "skills-store/imported-skills.json");

function mustExist(path: string, label: string) {
  if (!existsSync(path)) {
    throw new Error(`missing ${label}: ${path}`);
  }
}

// --- Hub root essentials (criteria 3) ---
mustExist(join(skillsRoot, "catalog.json"), "catalog.json");
const hasHubDoc =
  existsSync(join(skillsRoot, "README.md")) || existsSync(join(skillsRoot, "HUB.md"));
if (!hasHubDoc) {
  throw new Error("skills hub missing README.md and HUB.md");
}
mustExist(join(skillsRoot, "bin/skills.mjs"), "bin/skills.mjs");
mustExist(join(skillsRoot, "scripts/build-catalog.mjs"), "scripts/build-catalog.mjs");
mustExist(join(skillsRoot, "assets"), "assets/");

const catalogRaw = readFileSync(join(skillsRoot, "catalog.json"), "utf8");
const catalog = JSON.parse(catalogRaw) as Array<{ slug?: string; name?: string }>;
if (!Array.isArray(catalog) || catalog.length < 200) {
  throw new Error(`catalog.json unexpected shape/length: ${Array.isArray(catalog) ? catalog.length : typeof catalog}`);
}

const catalogSlugs = catalog
  .map((e) => e.slug)
  .filter((s): s is string => typeof s === "string" && s.length > 0);
if (catalogSlugs.length !== catalog.length) {
  throw new Error("catalog.json entries missing slug");
}

// --- Every catalog skill has SKILL.md under skills/ (criteria 1) ---
const missingSkillMd: string[] = [];
for (const slug of catalogSlugs) {
  const skillMd = join(skillsRoot, slug, "SKILL.md");
  if (!existsSync(skillMd) || !statSync(skillMd).isFile()) {
    missingSkillMd.push(slug);
  }
}
if (missingSkillMd.length) {
  throw new Error(
    `catalog skills missing SKILL.md (${missingSkillMd.length}): ${missingSkillMd.slice(0, 20).join(", ")}`,
  );
}

// Spot-check skill-local resources for packages that ship references/scripts
const resourceChecks: Array<{ slug: string; rel: string }> = [
  { slug: "google/cloud/agent-platform-skill-registry", rel: "references/query-skills.md" },
  { slug: "skill-creator", rel: "scripts/init_skill.py" },
  { slug: "1password", rel: "SKILL.md" },
];
for (const { slug, rel } of resourceChecks) {
  const p = join(skillsRoot, slug, rel);
  if (!existsSync(p)) {
    throw new Error(`skill resource missing: ${slug}/${rel}`);
  }
}

// --- skillhub-main package coverage (full skill tree beyond the 239 catalog) ---
// Representative packages from the imported skillhub skill tree.
const skillhubPackages = [
  "agent-browser",
  "agent-desktop",
  "agents-sdk",
  "animation-vocabulary",
  "apple-design",
  "cloudflare",
  "durable-objects",
  "emil-design-eng",
  "forge",
  "nvidia/cudaq-guide", // nvidia is a namespace of nested skills
  "pay",
  "sandbox-sdk",
  "stripe",
  "web-perf",
  "workers-best-practices",
  "wrangler",
  "youtube-clipper",
  "agent-orchestration/goal-loop",
];
const missingSkillhub: string[] = [];
for (const slug of skillhubPackages) {
  const skillMd = join(skillsRoot, slug, "SKILL.md");
  if (!existsSync(skillMd)) {
    missingSkillhub.push(slug);
  }
}
if (missingSkillhub.length) {
  throw new Error(`skillhub packages missing SKILL.md: ${missingSkillhub.join(", ")}`);
}

// --- Imported index covers catalog + full skillhub set (criteria 4) ---
mustExist(importedPath, "imported-skills.json");
const imported = JSON.parse(readFileSync(importedPath, "utf8")) as {
  count?: number;
  skills?: Array<{ slug?: string }>;
  generatedFrom?: string;
};
if (!Array.isArray(imported.skills) || imported.count !== imported.skills.length) {
  throw new Error(`imported-skills.json corrupt: count=${imported.count} length=${imported.skills?.length}`);
}
if ((imported.count ?? 0) < catalogSlugs.length) {
  throw new Error(`imported count ${imported.count} < catalog ${catalogSlugs.length}`);
}
// skillhub-main ships ~570 installable skills; index must cover that set
if ((imported.count ?? 0) < 570) {
  throw new Error(`imported count ${imported.count} < skillhub-main skill count 570`);
}

const indexSlugs = new Set(imported.skills.map((s) => s.slug).filter(Boolean));
const missingFromIndex = catalogSlugs.filter((s) => !indexSlugs.has(s));
if (missingFromIndex.length) {
  throw new Error(
    `catalog slugs missing from imported index (${missingFromIndex.length}): ${missingFromIndex.slice(0, 20).join(", ")}`,
  );
}
const missingSkillhubFromIndex = skillhubPackages.filter((s) => !indexSlugs.has(s));
if (missingSkillhubFromIndex.length) {
  throw new Error(`skillhub packages missing from index: ${missingSkillhubFromIndex.join(", ")}`);
}

// skills/ tree must contain at least catalog + hub tooling dirs
const top = readdirSync(skillsRoot);
for (const need of ["catalog.json", "bin", "scripts", "assets"]) {
  if (!top.includes(need)) {
    throw new Error(`skills root missing ${need}`);
  }
}

const out = {
  ok: true,
  catalogEntries: catalog.length,
  catalogSlugsSample: catalogSlugs.slice(0, 8),
  skillhubPackagesChecked: skillhubPackages.length,
  importedCount: imported.count,
  generatedFrom: imported.generatedFrom,
  hubDocs: {
    readme: existsSync(join(skillsRoot, "README.md")),
    hub: existsSync(join(skillsRoot, "HUB.md")),
    onchain: existsSync(join(skillsRoot, "ONCHAIN.md")),
  },
  missingSkillMd: 0,
  missingFromIndex: 0,
  missingSkillhub: 0,
};

console.log(JSON.stringify(out, null, 2));
console.log("hub-skills-integration.test.ts: ALL PASSED");
