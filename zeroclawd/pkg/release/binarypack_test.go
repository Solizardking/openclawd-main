package release

import (
	"strings"
	"testing"
)

func TestValidateBinaryInventory_rejectsSecretsAndCaches(t *testing.T) {
	required := []string{
		"build/clawdbot-darwin-arm64",
		"build/clawdbot-linux-amd64",
		"install.sh",
	}
	if err := ValidateBinaryInventory(required); err != nil {
		t.Fatalf("clean inventory should pass: %v", err)
	}

	cases := []struct {
		name string
		path string
	}{
		{"env local", "ship/.env.local"},
		{"env bak", "backup/.env.bak.20260720165453"},
		{"private pem", "keys/private.pem"},
		{"cache", "tree/.cache/go-build/x"},
		{"node_modules", "web/frontend/node_modules/left-pad/index.js"},
		{"outputs", "outputs/secret-run.json"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			paths := append([]string{}, required...)
			paths = append(paths, tc.path)
			err := ValidateBinaryInventory(paths)
			if err == nil {
				t.Fatalf("expected reject for %q", tc.path)
			}
			if !strings.Contains(err.Error(), "forbidden") {
				t.Fatalf("error %v should mention forbidden", err)
			}
		})
	}
}

func TestRequiredBinaryAssetNames(t *testing.T) {
	if got := RequiredBinaryAssetNames("darwin", "arm64"); got != "clawdbot-darwin-arm64" {
		t.Fatalf("got %q", got)
	}
	if got := RequiredBinaryAssetNames("windows", "amd64"); got != "clawdbot-windows-amd64.exe" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeBinaryInventoryPath(t *testing.T) {
	got := NormalizeBinaryInventoryPath(`.\.cache\foo`)
	if !strings.Contains(got, ".cache/") && got != ".cache/foo" {
		t.Fatalf("got %q", got)
	}
}
