package clawdcode

import (
	"os"
	"path/filepath"
	"testing"
)

// DefaultDir is ~/clawd-code, not a Clawd Cloud checkout path.
func TestDefaultDirIsHomeClawdCode(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		t.Skip("no home directory")
	}
	got := DefaultDir()
	want := filepath.Join(home, "clawd-code")
	if got != want {
		t.Fatalf("DefaultDir() = %q, want %q", got, want)
	}
}
