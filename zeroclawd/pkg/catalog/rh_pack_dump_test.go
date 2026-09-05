package catalog

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDumpRHPackCatalogForEvidence(t *testing.T) {
	if os.Getenv("RH_PACK_DUMP") != "1" {
		t.Skip("set RH_PACK_DUMP=1 to emit catalog JSON evidence")
	}
	_, thisFile, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", "skills"))
	skills, err := LoadSkills(root)
	if err != nil {
		t.Fatal(err)
	}
	outPath := os.Getenv("RH_PACK_DUMP_PATH")
	if outPath == "" {
		outPath = "rh-pack-dump.json"
	}
	f, err := os.Create(outPath)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	slugs := make([]string, 0, len(skills))
	for _, s := range skills {
		slugs = append(slugs, s.Slug)
	}
	if err := enc.Encode(map[string]any{"root": root, "count": len(skills), "slugs": slugs, "skills": skills}); err != nil {
		t.Fatal(err)
	}
}
