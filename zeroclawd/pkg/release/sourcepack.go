// Package release validates and documents the slim source package contract
// used by scripts/package-source.sh and git archive export-ignore rules.
package release

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// SoftMaxPackageBytes is the gzipped soft budget for the slim source archive.
// Full trees that include docs/PiedPiper-master are ~12MB; slim stays well
// under that even with the embedded Skill Hub pack (pkg/bundled/pack).
const SoftMaxPackageBytes int64 = 12 * 1024 * 1024

// RequiredSourcePaths must appear inside a slim installable source package.
var RequiredSourcePaths = []string{
	"go.mod",
	"go.sum",
	"Makefile",
	"install.sh",
	"README.md",
	"LICENSE",
	".env.example",
	".gitattributes",
	"cmd/clawdbot/main.go",
	"pkg/config/config.go",
	"scripts/package-source.sh",
}

// RequiredExportIgnorePrefixes must be present as export-ignore rules in .gitattributes.
// These keep git-archive / GitHub source downloads small (CLAWDBOT_SOURCE_MODE=archive).
var RequiredExportIgnorePrefixes = []string{
	"docs/PiedPiper-master/",
	".cache/",
	".claude/",
	"build/",
	"dist/",
	"**/package-lock.json",
	"**/pnpm-lock.yaml",
	"**/node_modules/",
}

// ForbiddenArchiveSubstrings must not appear in any slim archive entry path.
var ForbiddenArchiveSubstrings = []string{
	"PiedPiper-master",
	"package-lock.json",
	"pnpm-lock.yaml",
	"node_modules/",
	"/.cache/",
}

// ParseExportIgnorePaths returns path patterns marked export-ignore in gitattributes content.
func ParseExportIgnorePaths(content string) []string {
	var out []string
	sc := bufio.NewScanner(strings.NewReader(content))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Attributes may be: "path export-ignore" or "path attr1 export-ignore"
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		path := fields[0]
		hasExportIgnore := false
		for _, f := range fields[1:] {
			if f == "export-ignore" {
				hasExportIgnore = true
				break
			}
		}
		if hasExportIgnore {
			out = append(out, path)
		}
	}
	return out
}

// ValidateGitattributesContent checks that required export-ignore rules are declared.
func ValidateGitattributesContent(content string) error {
	rules := ParseExportIgnorePaths(content)
	have := make(map[string]bool, len(rules))
	for _, r := range rules {
		have[r] = true
	}
	var missing []string
	for _, want := range RequiredExportIgnorePrefixes {
		if !have[want] {
			missing = append(missing, want)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("gitattributes missing export-ignore for: %s", strings.Join(missing, ", "))
	}
	return nil
}

// ValidateGitattributesFile reads and validates a .gitattributes path.
func ValidateGitattributesFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return ValidateGitattributesContent(string(data))
}

// archiveTopLevelPrefix reports whether name is a known source-archive prefix
// (npm/package history used clawdbot-go-*; public GitHub repo uses Zero-Bruh-*).
func archiveTopLevelPrefix(name string) bool {
	return strings.HasPrefix(name, "clawdbot-go") ||
		strings.HasPrefix(name, "Zero-Bruh") ||
		strings.HasPrefix(name, "zero-bruh")
}

// NormalizeArchivePath strips a single top-level prefix (clawdbot-go-*/Zero-Bruh-*/).
func NormalizeArchivePath(entry string) string {
	entry = strings.TrimPrefix(entry, "./")
	if entry == "" {
		return ""
	}
	// git archive --prefix=clawdbot-go-VERSION/ or Zero-Bruh-VERSION/ → strip first segment
	if i := strings.IndexByte(entry, '/'); i >= 0 {
		first := entry[:i]
		rest := entry[i+1:]
		if archiveTopLevelPrefix(first) {
			return strings.TrimSuffix(rest, "/")
		}
	}
	// Prefix-only directory entry (clawdbot-go-dev/ or Zero-Bruh-main/) → empty residual path
	trimmed := strings.TrimSuffix(entry, "/")
	if archiveTopLevelPrefix(trimmed) && !strings.Contains(trimmed, "/") {
		return ""
	}
	return strings.TrimSuffix(entry, "/")
}

// ValidateArchiveEntries checks required presence and forbidden bulk absence.
func ValidateArchiveEntries(entries []string) error {
	normalized := make([]string, 0, len(entries))
	have := make(map[string]bool)
	for _, e := range entries {
		n := NormalizeArchivePath(e)
		if n == "" {
			continue
		}
		normalized = append(normalized, n)
		have[n] = true
	}

	var missing []string
	for _, req := range RequiredSourcePaths {
		if !have[req] {
			// directory-style listing sometimes includes only files; require exact file path
			missing = append(missing, req)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("slim package missing required paths: %s", strings.Join(missing, ", "))
	}

	var forbidden []string
	for _, n := range normalized {
		for _, bad := range ForbiddenArchiveSubstrings {
			if strings.Contains(n, bad) {
				forbidden = append(forbidden, n)
				break
			}
		}
	}
	if len(forbidden) > 0 {
		// cap noise
		if len(forbidden) > 12 {
			forbidden = forbidden[:12]
		}
		return fmt.Errorf("slim package contains excluded bulk: %s", strings.Join(forbidden, ", "))
	}
	return nil
}

// RepoRootFromWD walks up from the working directory looking for go.mod + scripts/package-source.sh.
func RepoRootFromWD() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	dir := wd
	for {
		if fileExists(filepath.Join(dir, "go.mod")) && fileExists(filepath.Join(dir, "scripts", "package-source.sh")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not locate go-bot repo root from %s", wd)
		}
		dir = parent
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// PackageResult is the outcome of a one-button slim source package build.
type PackageResult struct {
	OutputPath string `json:"outputPath"`
	FileName   string `json:"fileName"`
	Bytes      int64  `json:"bytes"`
	BuiltAt    string `json:"builtAt"`
	Script     string `json:"script"`
	Log        string `json:"log,omitempty"`
}

// DefaultPackageOutputPath returns build/clawdbot-go-source.tar.gz under projectRoot.
func DefaultPackageOutputPath(projectRoot string) string {
	return filepath.Join(projectRoot, "build", "clawdbot-go-source.tar.gz")
}

// BuildSlimPackage runs scripts/package-source.sh (the one-button ship path).
// outputPath may be empty to use DefaultPackageOutputPath.
func BuildSlimPackage(projectRoot, outputPath string) (PackageResult, error) {
	var zero PackageResult
	if strings.TrimSpace(projectRoot) == "" {
		return zero, fmt.Errorf("project root is required")
	}
	root, err := filepath.Abs(projectRoot)
	if err != nil {
		return zero, err
	}
	script := filepath.Join(root, "scripts", "package-source.sh")
	if !fileExists(script) {
		return zero, fmt.Errorf("package script not found: %s", script)
	}
	if strings.TrimSpace(outputPath) == "" {
		outputPath = DefaultPackageOutputPath(root)
	}
	if !filepath.IsAbs(outputPath) {
		outputPath = filepath.Join(root, outputPath)
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return zero, err
	}

	cmd := exec.Command("bash", script, outputPath)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "CLAWD_PACKAGE_DIR="+filepath.Dir(outputPath))
	out, err := cmd.CombinedOutput()
	logText := string(out)
	if err != nil {
		return PackageResult{Script: script, Log: logText}, fmt.Errorf("package-source.sh failed: %w\n%s", err, logText)
	}

	st, err := os.Stat(outputPath)
	if err != nil {
		return PackageResult{Script: script, Log: logText}, fmt.Errorf("package missing after build: %w", err)
	}
	if st.Size() == 0 {
		return PackageResult{Script: script, Log: logText}, fmt.Errorf("package is empty: %s", outputPath)
	}
	if st.Size() > SoftMaxPackageBytes {
		return PackageResult{
			OutputPath: outputPath,
			FileName:   filepath.Base(outputPath),
			Bytes:      st.Size(),
			BuiltAt:    time.Now().UTC().Format(time.RFC3339),
			Script:     script,
			Log:        logText,
		}, fmt.Errorf("package size %d exceeds soft max %d", st.Size(), SoftMaxPackageBytes)
	}

	return PackageResult{
		OutputPath: outputPath,
		FileName:   filepath.Base(outputPath),
		Bytes:      st.Size(),
		BuiltAt:    time.Now().UTC().Format(time.RFC3339),
		Script:     script,
		Log:        logText,
	}, nil
}
