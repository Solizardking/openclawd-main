// Package bundled embeds the redistributable Robinhood/EVM open skill pack.
// Files live in pack/ (synced from skills/ via scripts/sync-embedded-pack.sh)
// because many skills/ entries are symlinks that Go cannot embed.
package bundled

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:pack
var PackFS embed.FS

const (
	PackIndexFile = "pack-index.json"
	embedMarker   = ".clawdbot-embed-version"
)

// PackIndex is the on-disk pack-index.json shape.
type PackIndex struct {
	ID      string   `json:"id"`
	Version int      `json:"version"`
	Skills  []string `json:"skills"`
}

// ReadPackIndex decodes pack-index.json from the embedded pack.
func ReadPackIndex() (PackIndex, error) {
	var idx PackIndex
	data, err := PackFS.ReadFile("pack/" + PackIndexFile)
	if err != nil {
		return idx, err
	}
	if err := json.Unmarshal(data, &idx); err != nil {
		return idx, err
	}
	return idx, nil
}

// EmbedVersion is a stable marker written next to an extracted pack.
func EmbedVersion() string {
	idx, err := ReadPackIndex()
	if err != nil {
		return "unknown"
	}
	if idx.ID == "" {
		idx.ID = "rh-crypto-agent"
	}
	return fmt.Sprintf("%s-%d", idx.ID, idx.Version)
}

// DefaultExtractDir is $CLAWDBOT_HOME/skills or the user cache.
func DefaultExtractDir() (string, error) {
	if home := strings.TrimSpace(os.Getenv("CLAWDBOT_HOME")); home != "" {
		return filepath.Join(home, "skills"), nil
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cache, "clawdbot", "skills-pack"), nil
}

// ExtractTo materializes the embedded pack under dest.
// It is a no-op when dest already matches the current embed version.
func ExtractTo(dest string) (string, error) {
	if strings.TrimSpace(dest) == "" {
		return "", fmt.Errorf("empty extract destination")
	}
	dest, err := filepath.Abs(dest)
	if err != nil {
		return "", err
	}
	want := EmbedVersion()
	marker := filepath.Join(dest, embedMarker)
	if current, err := os.ReadFile(marker); err == nil && strings.TrimSpace(string(current)) == want {
		if packLooksComplete(dest) {
			return dest, nil
		}
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return "", err
	}
	root, err := fs.Sub(PackFS, "pack")
	if err != nil {
		return "", err
	}
	err = fs.WalkDir(root, ".", func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == "." {
			return nil
		}
		target := filepath.Join(dest, path)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := fs.ReadFile(root, path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(marker, []byte(want+"\n"), 0o644); err != nil {
		return "", err
	}
	if !packLooksComplete(dest) {
		return "", fmt.Errorf("extracted pack at %s is incomplete", dest)
	}
	return dest, nil
}

func packLooksComplete(dest string) bool {
	if _, err := os.Stat(filepath.Join(dest, PackIndexFile)); err != nil {
		return false
	}
	entries, err := os.ReadDir(dest)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			if _, err := os.Stat(filepath.Join(dest, entry.Name(), "SKILL.md")); err == nil {
				return true
			}
		}
	}
	return false
}
