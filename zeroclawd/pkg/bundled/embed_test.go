package bundled

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractTo_writesPackIndexAndSkills(t *testing.T) {
	dest := t.TempDir()
	out, err := ExtractTo(dest)
	if err != nil {
		t.Fatalf("ExtractTo: %v", err)
	}
	if out != dest {
		t.Fatalf("out=%q dest=%q", out, dest)
	}
	if _, err := os.Stat(filepath.Join(dest, PackIndexFile)); err != nil {
		t.Fatal(err)
	}
	for _, slug := range []string{
		"rh-bonded-launch", "rh-launchpad-v3", "swap-integration", "viem-integration",
		"solana-dev", "cheshire-terminal", "pumpfun", "pay", "vulcan",
		"agentic-wallet", "alchemy-api", "messari-x402",
	} {
		if _, err := os.Stat(filepath.Join(dest, slug, "SKILL.md")); err != nil {
			t.Errorf("missing %s: %v", slug, err)
		}
	}
	idx, err := ReadPackIndex()
	if err != nil {
		t.Fatal(err)
	}
	if len(idx.Skills) < 4 {
		t.Fatalf("pack-index skills=%d", len(idx.Skills))
	}
	if _, err := ExtractTo(dest); err != nil {
		t.Fatalf("second ExtractTo: %v", err)
	}

	body, err := os.ReadFile(filepath.Join(dest, "rh-bonded-launch", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "<<<<<<<") || strings.Contains(string(body), ">>>>>>>") {
		t.Fatal("bundled rh-bonded-launch SKILL.md contains merge conflict markers")
	}
}
