#!/usr/bin/env bash
# Materialize the clawdbot embedded skill pack into pkg/bundled/pack as regular
# files (Go cannot embed the skills/ → .agents/ symlinks).
#
# Sources:
#   1. go-bot/skills pack-index.json (Robinhood / EVM open pack)
#   2. train2earn/skills/skills (local Skill Hub library)
#   3. github.com/Solizardking/skillhub-main/skills (public hub, SKILL.md + catalog)
#
# Excluded on purpose (secrets / bulk): node_modules, package-lock.json,
# public/, scanner binaries, nvidia extra YAML dumps beyond SKILL.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/skills"
DEST="$ROOT/pkg/bundled/pack"
INDEX="$SRC/pack-index.json"
T2E="${CLAWD_TRAIN2EARN_SKILLS:-/Users/8bit/drive/train2earn/skills}"
STAGING="$ROOT/build/skillhub-main-sparse"
[[ -f "$INDEX" ]] || { echo "missing $INDEX" >&2; exit 1; }

resolve_skillhub_main() {
  if [[ -n "${CLAWD_SKILLHUB_MAIN:-}" && -d "${CLAWD_SKILLHUB_MAIN}" ]]; then
    printf '%s\n' "${CLAWD_SKILLHUB_MAIN}"
    return 0
  fi
  local cand gitdir
  for cand in \
    /Users/8bit/Downloads/skillhub-main \
    /Users/8bit/Downloads/sort/skillhub-main \
    "${HOME}/skillhub-main"; do
    gitdir="$cand"
    if [[ -d "$gitdir/.git" ]] || git -C "$gitdir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git -C "$gitdir" fetch --depth=1 origin main
      rm -rf "$STAGING"
      mkdir -p "$STAGING"
      git -C "$gitdir" archive origin/main skills catalog.json README.md HUB.md ONCHAIN.md DOMAINS.md RELAY.md UPLOAD.md package.json \
        | tar -x -C "$STAGING"
      printf '%s\n' "$STAGING"
      return 0
    fi
  done
  rm -rf "$STAGING"
  git clone --depth 1 --filter=blob:none --sparse https://github.com/Solizardking/skillhub-main.git "$STAGING"
  git -C "$STAGING" sparse-checkout set skills
  printf '%s\n' "$STAGING"
}

HUB_MAIN="$(resolve_skillhub_main)"
echo "skillhub-main root: $HUB_MAIN"

python3 - "$INDEX" "$SRC" "$DEST" "$T2E" "$HUB_MAIN" <<'PY'
import json, shutil, sys
from pathlib import Path

index_path, src, dest, t2e, hub_main = map(Path, sys.argv[1:])
idx = json.loads(index_path.read_text())
skills = list(idx.get("skills") or [])
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)

def ignore(_directory, names):
    skip = {
        "node_modules", ".git", ".DS_Store", "package-lock.json",
        "pnpm-lock.yaml", ".cache", "dist", "build",
    }
    return [n for n in names if n in skip]

def copy_skill_tree(skills_root: Path, overwrite: bool) -> int:
    if not skills_root.is_dir():
        return 0
    added = 0
    for skill_md in skills_root.rglob("SKILL.md"):
        rel = skill_md.parent.relative_to(skills_root)
        if any(part in {"node_modules", ".git", "public"} for part in rel.parts):
            continue
        target_dir = dest / rel
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "SKILL.md"
        if target.exists() and not overwrite:
            continue
        shutil.copy2(skill_md, target)
        added += 1
        for sib in skill_md.parent.iterdir():
            if not sib.is_file():
                continue
            if sib.name in {"SKILL.md", "package-lock.json", "pnpm-lock.yaml"}:
                continue
            if sib.suffix.lower() not in {".md", ".json", ".txt", ".toml", ".yaml", ".yml"}:
                continue
            if sib.stat().st_size > 256 * 1024:
                continue
            out = target_dir / sib.name
            if not out.exists():
                shutil.copy2(sib, out)
    return added

shutil.copy2(index_path, dest / "pack-index.json")
copied_dirs = 0
for slug in skills:
    src_dir = (src / slug).resolve()
    if not src_dir.is_dir():
        raise SystemExit(f"missing RH skill dir {src_dir}")
    shutil.copytree(src_dir, dest / slug, symlinks=False, ignore=ignore)
    copied_dirs += 1

t2e_md = copy_skill_tree(t2e / "skills", overwrite=True)
hub_md = copy_skill_tree(hub_main / "skills", overwrite=False)

META_NAMES = (
    "catalog.json", "skillhub-index.json", "skills-lock.json",
    "skills.sh.json", "README.md", "HUB.md", "ONCHAIN.md",
    "DOMAINS.md", "RELAY.md", "UPLOAD.md", "package.json",
    "vercel.json", "render.yaml",
)

def copy_hub_meta(root: Path) -> None:
    if not root.is_dir():
        return
    for name in META_NAMES:
        src_file = root / name
        if src_file.is_file() and src_file.stat().st_size < 5 * 1024 * 1024:
            target = dest / name
            if not target.exists():
                shutil.copy2(src_file, target)
    for folder in ("engineering", "onchain", "productivity", "pump-fun", "scripts", "assets", "site"):
        src_dir = root / folder
        if not src_dir.is_dir():
            continue
        for path in src_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".md", ".json", ".sh", ".yaml", ".yml", ".txt"}:
                continue
            if path.name in {"package-lock.json", "pnpm-lock.yaml"}:
                continue
            if path.stat().st_size > 256 * 1024:
                continue
            rel = path.relative_to(root)
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            if not out.exists():
                shutil.copy2(path, out)

# Local hub first (catalog + docs), then GitHub fills gaps.
copy_hub_meta(t2e)
copy_hub_meta(hub_main)

def catalog_entries(path: Path):
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return data
    return []

merged = []
seen = set()
for path in (src / "catalog.json", dest / "catalog.json", hub_main / "catalog.json"):
    for entry in catalog_entries(path):
        slug = (entry.get("slug") or entry.get("name") or "").strip()
        if slug and slug not in seen:
            seen.add(slug)
            merged.append(entry)
if merged:
    (dest / "catalog.json").write_text(json.dumps(merged, indent=2) + "\n")

idx["version"] = int(idx.get("version") or 1) + 1
idx["skillCount"] = len(list(dest.rglob("SKILL.md")))
idx["hub"] = "train2earn/skills/skills + github.com/Solizardking/skillhub-main/skills"
hub_note = (
    "Bundled with train2earn/skills/skills and "
    "https://github.com/Solizardking/skillhub-main/tree/main/skills "
    "(Cheshire, Solana, Pump, Vulcan)."
)
desc = idx.get("description") or ""
for marker in (
    "Bundled with the train2earn Skill Hub",
    "Bundled with train2earn/skills/skills",
):
    while marker in desc:
        desc = desc[: desc.find(marker)].rstrip()
idx["description"] = (desc + " " + hub_note).strip()
(dest / "pack-index.json").write_text(json.dumps(idx, indent=2) + "\n")
(src / "pack-index.json").write_text(json.dumps(idx, indent=2) + "\n")

print(
    f"RH dirs={copied_dirs} train2earn SKILL.md={t2e_md} "
    f"skillhub-main added={hub_md} total SKILL.md={idx['skillCount']} "
    f"catalog={len(merged)} -> {dest}"
)
PY
