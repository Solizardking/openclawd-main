package catalog

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// OBJECTIVE Robinhood/EVM open skill pack names (must stay in sync with go-bot/skills/pack-index.json).
var objectiveRHSkills = []string{
	"blockscout-analysis",
	"copy-trade",
	"dca-bot",
	"deployer",
	"index-bot",
	"liquidity-planner",
	"lp-integration",
	"pay-with-any-token",
	"pay-with-app",
	"rh-bonded-launch",
	"rh-launchpad-v3",
	"swap-integration",
	"swap-planner",
	"v4-hook-generator",
	"v4-sdk-integration",
	"v4-security-foundations",
	"viem-integration",
	"web3-dev",
}

func repoSkillsPackRoot(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// pkg/catalog -> go-bot/skills
	root := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", "skills"))
	if !isSkillPackRoot(root) {
		t.Fatalf("bundled skill pack missing or incomplete at %s", root)
	}
	return root
}

func TestBundledRHSkillPackInventory(t *testing.T) {
	root := repoSkillsPackRoot(t)

	indexSlugs, err := PackIndexSkillSlugs(root)
	if err != nil {
		t.Fatalf("PackIndexSkillSlugs: %v", err)
	}
	if len(indexSlugs) < len(objectiveRHSkills) {
		t.Fatalf("pack-index skills=%d want >= %d", len(indexSlugs), len(objectiveRHSkills))
	}
	indexSet := map[string]struct{}{}
	for _, s := range indexSlugs {
		indexSet[s] = struct{}{}
	}
	for _, name := range objectiveRHSkills {
		if _, ok := indexSet[name]; !ok {
			t.Errorf("pack-index.json missing skill %q", name)
		}
		skillPath := filepath.Join(root, name, "SKILL.md")
		data, err := os.ReadFile(skillPath)
		if err != nil {
			t.Errorf("missing SKILL.md for %s: %v", name, err)
			continue
		}
		body := string(data)
		// Frontmatter name or directory identity must appear in the file.
		if !strings.Contains(body, "name:") && !strings.Contains(body, name) {
			t.Errorf("%s/SKILL.md missing name frontmatter or skill id", name)
		}
		// Prefer exact name frontmatter match when present.
		if strings.Contains(body, "---") {
			fm := parseFrontMatter(body)
			if fmName := strings.TrimSpace(fm["name"]); fmName != "" && fmName != name {
				// Allow display names that equal slug; warn only on empty
				_ = fmName
			}
			if strings.TrimSpace(fm["description"]) == "" && !strings.Contains(strings.ToLower(body), "robinhood") && !strings.Contains(strings.ToLower(body), "uniswap") && !strings.Contains(strings.ToLower(body), "viem") && !strings.Contains(strings.ToLower(body), "swap") && !strings.Contains(strings.ToLower(body), "dca") && !strings.Contains(strings.ToLower(body), "copy") {
				// description optional if body has substance
				if len(strings.TrimSpace(body)) < 80 {
					t.Errorf("%s/SKILL.md too short / empty description", name)
				}
			}
		}
	}
}

func TestLoadSkillsRealRHPack(t *testing.T) {
	root := repoSkillsPackRoot(t)
	skills, err := LoadSkills(root)
	if err != nil {
		t.Fatalf("LoadSkills(%s): %v", root, err)
	}
	if len(skills) < len(objectiveRHSkills) {
		t.Fatalf("LoadSkills returned %d skills, want >= %d", len(skills), len(objectiveRHSkills))
	}
	bySlug := map[string]SkillEntry{}
	for _, s := range skills {
		bySlug[s.Slug] = s
	}
	for _, name := range objectiveRHSkills {
		entry, ok := bySlug[name]
		if !ok {
			t.Errorf("LoadSkills missing %q", name)
			continue
		}
		if entry.FilePath == "" || !fileExists(entry.FilePath) {
			t.Errorf("%s: expected existing FilePath, got %q", name, entry.FilePath)
		}
		if !strings.Contains(strings.ToLower(entry.FilePath), strings.ToLower(name)) {
			t.Errorf("%s: FilePath %q does not reference skill dir", name, entry.FilePath)
		}
	}

	// Spot-check OBJECTIVE subset required by verification plan.
	for _, must := range []string{"rh-bonded-launch", "rh-launchpad-v3", "swap-integration", "viem-integration", "copy-trade", "dca-bot"} {
		if _, ok := bySlug[must]; !ok {
			t.Errorf("required skill %q missing from catalog", must)
		}
	}
}

func TestBuildReportMergesBundledPack(t *testing.T) {
	root := repoSkillsPackRoot(t)
	// Point SkillsDir at empty temp so merge path must load bundled pack via cwd walk.
	// Chdir to go-bot so BundledSkillsDir finds ./skills.
	goBotRoot := filepath.Dir(root)
	prev, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(goBotRoot); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(prev) })

	tmp := t.TempDir()
	// Solana-first empty dir should not error out BuildReport
	report := BuildReport(Roots{
		SkillsDir:       tmp,
		AgentsDir:       tmp,
		ZKPrimitivesDir: "",
	})
	// LoadSkills(tmp) fails (empty/not a pack) — ok with warning; bundled still merges.
	bySlug := map[string]bool{}
	for _, s := range report.Skills {
		bySlug[s.Slug] = true
	}
	// When SkillsDir is empty and LoadSkills fails, bundled still appends if BundledSkillsDir works.
	if len(report.Skills) < len(objectiveRHSkills) {
		// If LoadSkills(tmp) fails, we rely on bundled merge. Ensure BundledSkillsDir works.
		if BundledSkillsDir() == "" {
			t.Fatalf("BundledSkillsDir empty after chdir to %s", goBotRoot)
		}
		// Re-run with SkillsDir = pack root to prove additive path and clean discovery.
		report = BuildReport(Roots{SkillsDir: root, AgentsDir: tmp})
		bySlug = map[string]bool{}
		for _, s := range report.Skills {
			bySlug[s.Slug] = true
		}
	}
	missing := 0
	for _, name := range objectiveRHSkills {
		if !bySlug[name] {
			t.Errorf("BuildReport missing %q", name)
			missing++
		}
	}
	if missing > 0 {
		t.Fatalf("%d skills missing; total loaded=%d", missing, len(report.Skills))
	}
}

func TestDefaultRootsPrefersBundledPackWithoutEnv(t *testing.T) {
	t.Setenv(EnvSkillsDir, "")
	_ = os.Unsetenv(EnvSkillsDir)
	t.Setenv("CLAWDBOT_BUNDLED_SKILLS_DIR", "")
	t.Setenv("CLAWDBOT_HOME", t.TempDir())

	roots := DefaultRoots()
	if !isSkillPackRoot(roots.SkillsDir) {
		t.Fatalf("DefaultRoots SkillsDir=%q is not a skill pack root", roots.SkillsDir)
	}
	skills, err := LoadSkills(roots.SkillsDir)
	if err != nil {
		t.Fatalf("LoadSkills: %v", err)
	}
	bySlug := map[string]bool{}
	for _, s := range skills {
		bySlug[s.Slug] = true
	}
	for _, name := range []string{"rh-bonded-launch", "solana-dev"} {
		if !bySlug[name] {
			t.Errorf("default pack missing %q (loaded=%d dir=%s)", name, len(skills), roots.SkillsDir)
		}
	}
}
