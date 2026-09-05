#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const storeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(storeRoot, "..", "skills");
const ignored = new Set([".git", ".lake", ".vercel", "node_modules", "target", "dist", "__pycache__"]);

function frontmatter(markdown) {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {};
  const attrs = {};
  for (const line of markdown.slice(3, end).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match || !match[2].trim() || [">", "|"].includes(match[2].trim())) continue;
    attrs[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return attrs;
}

const entries = [];
function visit(dir) {
  const skillMd = join(dir, "SKILL.md");
  if (existsSync(skillMd)) {
    const attrs = frontmatter(readFileSync(skillMd, "utf8"));
    const path = relative(skillsRoot, dir).split(sep).join("/");
    entries.push({
      slug: path,
      name: attrs.name || path.split("/").at(-1),
      description: attrs.description || "",
      version: attrs.version || null,
      path: `skills/${path}`,
      skillMdUrl: `/api/skills/${path}/SKILL.md`,
      storeSkillMdUrl: `/api/skills-store/${path}/SKILL.md`,
    });
  }
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ignored.has(entry.name)) continue;
    visit(join(dir, entry.name));
  }
}

visit(skillsRoot);
entries.sort((a, b) => a.slug.localeCompare(b.slug));
writeFileSync(join(storeRoot, "imported-skills.json"), `${JSON.stringify({ schemaVersion: "cheshire-imported-skills/v1", generatedFrom: "../skills", count: entries.length, skills: entries }, null, 2)}\n`);
console.log(`Indexed ${entries.length} skills from ${skillsRoot}`);
