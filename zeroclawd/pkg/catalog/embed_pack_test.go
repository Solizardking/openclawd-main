package catalog

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildReportFromForeignCwdUsesEmbeddedPack(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CLAWDBOT_HOME", tmp)
	t.Setenv(EnvSkillsDir, "")
	_ = os.Unsetenv(EnvSkillsDir)
	t.Setenv("CLAWDBOT_BUNDLED_SKILLS_DIR", "")

	foreign := filepath.Join(tmp, "not-the-repo")
	if err := os.MkdirAll(foreign, 0o755); err != nil {
		t.Fatal(err)
	}
	prev, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(foreign); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(prev) })

	if walkParentsForPack() != "" {
		t.Fatalf("cwd walk should miss the pack from %s", foreign)
	}

	roots := DefaultRoots()
	if !isSkillPackRoot(roots.SkillsDir) {
		t.Fatalf("DefaultRoots SkillsDir=%q is not a pack root (embedded extract failed)", roots.SkillsDir)
	}

	report := BuildReport(roots)
	bySlug := map[string]bool{}
	for _, s := range report.Skills {
		bySlug[s.Slug] = true
	}
	for _, must := range []string{
		"rh-bonded-launch", "rh-launchpad-v3", "swap-integration", "viem-integration",
		"solana-dev", "cheshire-terminal", "pumpfun", "pay", "vulcan",
		"agentic-wallet", "alchemy-api", "messari-x402",
	} {
		if !bySlug[must] {
			t.Errorf("foreign-cwd catalog missing %q (loaded=%d)", must, len(report.Skills))
		}
	}
	if len(report.Skills) < 100 {
		t.Fatalf("expected hub-sized catalog, got %d skills", len(report.Skills))
	}
	if t.Failed() {
		t.Fatalf("skills dir=%s total=%d", roots.SkillsDir, len(report.Skills))
	}
}

func TestCatalogListsPackIndexSkillsFirst(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CLAWDBOT_HOME", tmp)
	t.Setenv(EnvSkillsDir, "")
	_ = os.Unsetenv(EnvSkillsDir)
	t.Setenv("CLAWDBOT_BUNDLED_SKILLS_DIR", "")

	foreign := filepath.Join(tmp, "not-the-repo")
	if err := os.MkdirAll(foreign, 0o755); err != nil {
		t.Fatal(err)
	}
	prev, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(foreign); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(prev) })

	roots := DefaultRoots()
	idx, err := PackIndexSkillSlugs(roots.SkillsDir)
	if err != nil {
		t.Fatalf("PackIndexSkillSlugs: %v", err)
	}
	if len(idx) == 0 {
		t.Fatal("pack-index.json has no skills")
	}

	report := BuildReport(roots)
	loaded := map[string]bool{}
	for _, skill := range report.Skills {
		loaded[skill.Slug] = true
	}
	var want []string
	for _, slug := range idx {
		if loaded[slug] {
			want = append(want, slug)
		}
	}
	if len(want) == 0 {
		t.Fatal("no pack-index skills loaded into catalog")
	}
	if len(report.Skills) < len(want) {
		t.Fatalf("catalog has %d skills, loaded pack-index has %d", len(report.Skills), len(want))
	}
	for i, slug := range want {
		if report.Skills[i].Slug != slug {
			leading := make([]string, 0, len(want))
			for j := 0; j < len(want); j++ {
				leading = append(leading, report.Skills[j].Slug)
			}
			t.Fatalf("catalog[%d]=%q want pack-index %q (leading=%v)", i, report.Skills[i].Slug, slug, leading)
		}
	}
	for _, must := range []string{"rh-bonded-launch", "rh-launchpad-v3", "swap-integration", "viem-integration"} {
		found := false
		for _, slug := range want {
			if slug == must {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("required skill %q not in leading pack-index listing", must)
		}
	}
}

func TestExtractedEmbeddedPackIsSkillPackRoot(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CLAWDBOT_HOME", tmp)
	dir := extractedEmbeddedPack()
	if dir == "" {
		t.Fatal("extractedEmbeddedPack returned empty")
	}
	if !isSkillPackRoot(dir) {
		t.Fatalf("%q is not a skill pack root", dir)
	}
	if filepath.Dir(dir) != tmp && filepath.Clean(dir) != filepath.Join(tmp, "skills") {
		t.Fatalf("extract dir %q should live under CLAWDBOT_HOME %q", dir, tmp)
	}
}
