package catalog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Locks catalog roots used when attaching Clawd Cloud as a sidecar.
// Attach is discovery of a Cloud checkout; it must not retarget ZK ownership
// or invent CLAWD_CLOUD_ROOT as a catalog root (not implemented).
func TestDefaultRootsLockEnvKeysAndZKOwner(t *testing.T) {
	if EnvSkillsDir != "CLAWDBOT_SKILLS_DIR" {
		t.Fatalf("EnvSkillsDir = %q", EnvSkillsDir)
	}
	if EnvAgentsDir != "CLAWDBOT_AGENTS_DIR" {
		t.Fatalf("EnvAgentsDir = %q", EnvAgentsDir)
	}
	if EnvZKPrimitivesDir != "CLAWDBOT_ZK_PRIMITIVES_DIR" {
		t.Fatalf("EnvZKPrimitivesDir = %q", EnvZKPrimitivesDir)
	}

	t.Setenv(EnvZKPrimitivesDir, "")
	_ = os.Unsetenv(EnvZKPrimitivesDir)
	t.Setenv("CLAWD_CLOUD_ROOT", filepath.Join(t.TempDir(), "clawd-cloud"))

	roots := DefaultRoots()
	if filepath.Base(filepath.Clean(roots.ZKPrimitivesDir)) != "zk-primitives" {
		t.Fatalf("ZKPrimitivesDir basename = %q, want zk-primitives", roots.ZKPrimitivesDir)
	}
	if strings.Contains(roots.ZKPrimitivesDir, "clawd-cloud") {
		t.Fatalf("CLAWD_CLOUD_ROOT must not become the ZK catalog root, got %q", roots.ZKPrimitivesDir)
	}
	if strings.Contains(roots.SkillsDir, "clawd-cloud") {
		t.Fatalf("CLAWD_CLOUD_ROOT must not become SkillsDir, got %q", roots.SkillsDir)
	}
}
