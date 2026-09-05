/**
 * RH Crypto Agent skill pack helpers (pack-index + SKILL.md trees).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(__dirname, "..");
export const SKILLS_DIR = join(PACKAGE_ROOT, "skills");
export const PACK_INDEX_PATH = join(SKILLS_DIR, "pack-index.json");
export const CATALOG_PATH = join(SKILLS_DIR, "catalog.json");

export function loadPackIndex() {
  if (!existsSync(PACK_INDEX_PATH)) {
    throw new Error(`pack-index missing: ${PACK_INDEX_PATH}`);
  }
  const pack = JSON.parse(readFileSync(PACK_INDEX_PATH, "utf8"));
  if (!Array.isArray(pack.skills)) {
    throw new Error("pack-index.json skills must be an array");
  }
  return pack;
}

export function listSkillIds() {
  return [...loadPackIndex().skills];
}

export function inspectPack() {
  const pack = loadPackIndex();
  const skills = [];
  const missing = [];
  for (const id of pack.skills) {
    const dir = join(SKILLS_DIR, id);
    const md = join(dir, "SKILL.md");
    const okDir = existsSync(dir) && statSync(dir).isDirectory();
    const okMd = existsSync(md);
    skills.push({ id, path: dir, skillMd: okMd });
    if (!okDir || !okMd) missing.push(id);
  }
  // skills[] is the redistributable RH/EVM pack. skillCount may be the
  // larger embedded hub (train2earn + skillhub-main) carried by the Go binary.
  if (pack.skillCount != null && pack.skillCount < pack.skills.length) {
    missing.push(`skillCount ${pack.skillCount} is below skills[] length ${pack.skills.length}`);
  }
  return {
    ok: missing.length === 0,
    packId: pack.id,
    name: pack.name,
    skillCount: pack.skills.length,
    productHost: pack.productHost,
    terminalHost: pack.terminalHost,
    agentHub: pack.agentHub,
    forgeHost: pack.forgeHost,
    zeroClawdHost: pack.zeroClawdHost,
    agentsNpm: pack.agentsNpm,
    agentsRepo: pack.agentsRepo,
    skillHubRepo: pack.skillHubRepo,
    skills,
    missing,
    skillsDir: SKILLS_DIR,
  };
}

export function listSkillDirectoriesWithSkillMd(root = SKILLS_DIR) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => {
      const dir = join(root, name);
      return (
        existsSync(dir) &&
        statSync(dir).isDirectory() &&
        existsSync(join(dir, "SKILL.md"))
      );
    })
    .sort();
}

export function loadCatalog() {
  if (!existsSync(CATALOG_PATH)) return [];
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  return Array.isArray(raw) ? raw : [];
}
