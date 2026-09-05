#!/usr/bin/env node
/**
 * Validate skills-store packages against agentskills-style rules used by
 * server/routes/skills-store.ts (name format, description length, catalog sync).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STORE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return { attrs: {}, body: markdown };
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return { attrs: {}, body: markdown };
  const raw = markdown.slice(3, end).trimEnd();
  const attrs = {};
  let currentKey = null;
  let block = false;
  let blockLines = [];

  const flush = () => {
    if (block && currentKey) {
      attrs[currentKey] = blockLines.join(" ").replace(/\s+/g, " ").trim();
      block = false;
      blockLines = [];
    }
  };

  for (const line of raw.split("\n")) {
    if (block) {
      if (/^\S/.test(line) && line.includes(":")) {
        flush();
      } else {
        blockLines.push(line.trim());
        continue;
      }
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    currentKey = m[1];
    const value = m[2].trim();
    if (value === ">" || value === "|") {
      block = true;
      blockLines = [];
      continue;
    }
    attrs[currentKey] = value.replace(/^["']|["']$/g, "");
  }
  flush();
  return { attrs, body: markdown.slice(end + 4).trim() };
}

function listDirs() {
  return readdirSync(STORE_ROOT)
    .filter((name) => {
      if (name === "scripts" || name.startsWith(".")) return false;
      const p = join(STORE_ROOT, name);
      return statSync(p).isDirectory() && existsSync(join(p, "SKILL.md"));
    })
    .sort();
}

let failed = 0;
const dirs = listDirs();
console.log(`skills-store validate → ${STORE_ROOT}`);
console.log(`packages: ${dirs.join(", ") || "(none)"}`);
console.log("");

const catalogPath = join(STORE_ROOT, "catalog.json");
let catalogSkills = [];
if (!existsSync(catalogPath)) {
  console.log("FAIL  catalog.json missing");
  failed += 1;
} else {
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    catalogSkills = Array.isArray(catalog)
      ? catalog
      : Array.isArray(catalog.skills)
        ? catalog.skills
        : [];
    console.log(`PASS  catalog.json (${catalogSkills.length} skills)`);
  } catch (e) {
    console.log(`FAIL  catalog.json parse: ${e.message}`);
    failed += 1;
  }
}

const catalogNames = new Set(catalogSkills.map((s) => s.name || s.path));

const importedIndexPath = join(STORE_ROOT, "imported-skills.json");
if (!existsSync(importedIndexPath)) {
  console.log("FAIL  imported-skills.json missing (run pnpm run index:skills-store)");
  failed += 1;
} else {
  try {
    const imported = JSON.parse(readFileSync(importedIndexPath, "utf8"));
    const importedSkills = Array.isArray(imported.skills) ? imported.skills : [];
    const sourceRoot = join(STORE_ROOT, "..", "skills");
    const missing = importedSkills.filter((skill) => !existsSync(join(sourceRoot, skill.slug, "SKILL.md")));
    if (imported.count !== importedSkills.length || missing.length > 0) {
      console.log(`FAIL  imported-skills.json inconsistent (${imported.count} declared, ${importedSkills.length} entries, ${missing.length} missing)`);
      failed += 1;
    } else {
      console.log(`PASS  imported-skills.json (${importedSkills.length} skills)`);
    }
  } catch (e) {
    console.log(`FAIL  imported-skills.json parse: ${e.message}`);
    failed += 1;
  }
}

for (const dir of dirs) {
  const skillMd = readFileSync(join(STORE_ROOT, dir, "SKILL.md"), "utf8");
  const { attrs, body } = parseFrontmatter(skillMd);
  const name = String(attrs.name || "").trim();
  const description = String(attrs.description || "").trim();

  const checks = [
    ["name present", Boolean(name)],
    ["name format", NAME_RE.test(name)],
    ["name matches dir", name === dir],
    ["description 1..1024", description.length >= 1 && description.length <= 1024],
    ["body non-empty", body.length > 20],
    ["in catalog.json", catalogNames.has(dir) || catalogNames.has(name)],
  ];

  // optional resources listed in catalog
  const cat = catalogSkills.find((s) => s.name === name || s.path === dir);
  if (cat?.references) {
    for (const ref of cat.references) {
      checks.push([`ref ${ref}`, existsSync(join(STORE_ROOT, dir, ref))]);
    }
  }
  if (cat?.scripts) {
    for (const script of cat.scripts) {
      checks.push([`script ${script}`, existsSync(join(STORE_ROOT, dir, script))]);
    }
  }

  let pkgFail = 0;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.log(`FAIL  ${dir}: ${label}`);
      pkgFail += 1;
      failed += 1;
    }
  }
  if (pkgFail === 0) {
    console.log(`PASS  ${dir} v${attrs.version || "?"} (desc ${description.length} chars)`);
  }
}

// catalog entries must exist on disk
for (const s of catalogSkills) {
  const pathName = s.path || s.name;
  if (!pathName) continue;
  if (!existsSync(join(STORE_ROOT, pathName, "SKILL.md"))) {
    console.log(`FAIL  catalog skill missing on disk: ${pathName}`);
    failed += 1;
  }
}

console.log("");
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
