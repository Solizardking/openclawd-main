package release

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ForbiddenBinarySubstrings must not appear in any downloadable binary/archive
// inventory path. These are secrets or generated bulk from the go-bot tree.
var ForbiddenBinarySubstrings = []string{
	".env.local",
	".env.bak",
	"private.pem",
	".cache/",
	"node_modules/",
	"outputs/",
}

// RequiredBinaryAssetNames are the named OS/arch clawdbot artifacts a
// one-click installer looks for (clawdbot-$GOOS-$GOARCH).
func RequiredBinaryAssetNames(goos, goarch string) string {
	name := "clawdbot-" + goos + "-" + goarch
	if goos == "windows" {
		name += ".exe"
	}
	return name
}

// ValidateBinaryInventory rejects secret/cache paths in a packaging inventory.
// Paths may be absolute or relative; matching is on slash-normalized strings.
func ValidateBinaryInventory(paths []string) error {
	var hits []string
	for _, raw := range paths {
		n := NormalizeBinaryInventoryPath(raw)
		if n == "" {
			continue
		}
		for _, bad := range ForbiddenBinarySubstrings {
			if strings.Contains(n, bad) {
				hits = append(hits, n)
				break
			}
		}
	}
	if len(hits) == 0 {
		return nil
	}
	if len(hits) > 12 {
		hits = hits[:12]
	}
	return fmt.Errorf("binary inventory contains forbidden paths: %s", strings.Join(hits, ", "))
}

// NormalizeBinaryInventoryPath slash-normalizes a path for inventory matching.
func NormalizeBinaryInventoryPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	p = strings.ReplaceAll(p, `\`, "/")
	p = strings.TrimPrefix(p, "./")
	// Keep a trailing slash on directory-looking entries that already have one.
	cleaned := filepath.ToSlash(p)
	return cleaned
}
